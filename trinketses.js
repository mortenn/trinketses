(function()
{
	const ilevel_color_table = {};

	// Override base item level for some trinkets that don't have their base in the sim.
	const ilevel_override = {
		159610: 300,
		159624: 300,
		160651: 350,
		160654: 350,
		161417: 355,
		165571: 350,
		166418: 350,
		167867: 350
	};
	// Some additional item id mapping data as WarcraftPriests JSON feed is missing some.
	const trinketNames = {
		167555: 'Pocket-Sized Computation Device',
		161417: 'Ancient Knot of Wisdom',
		166418: 'Crest of Pa\'ku'
	};

	const app = angular.module('trinketses', ['ngResource', 'highcharts-ng']);

	app.config(
		function($compileProvider)
		{
			$compileProvider.debugInfoEnabled(false);
		}
	);

	app.factory(
		'WarcraftPriests',
		function($resource)
		{
			return $resource(
				'https://raw.githubusercontent.com/WarcraftPriests/bfa-shadow-priest/master/json_Charts/:chart',
				{chart:'@chart'}
			);
		}
	);

	app.component(
		'trinketList',
		{
			templateUrl: 'trinketList.html',
			controller: TrinketList
		}
	);
	function TrinketList($scope, $window, $timeout)
	{
		const ctrl = this;

		const ParseTrinket = function(trinket)
		{
			trinket.wowhead = 'https://www.wowhead.com/item=' + trinket.id;
			if(trinket.gem_id)
			{
				const gems = trinket.gem_id.split('/');
				const bonus = trinket.gem_bonus_id ? trinket.gem_bonus_id.split('/') : [];
				trinket.wowhead += '&gems=' + gems.join(':');
				trinket.gems = [];
				for(let g = 0; g < gems.length; ++g)
				{
					const gem = {
						id: gems[g],
						bonus: bonus[g] || null,
						wowhead: 'https://www.wowhead.com/item=' + gems[g]
					};
					if(gem.bonus)
						gem.wowhead += '&bonus=' + gem.bonus;
					trinket.gems.push(gem);
				}
			}
			if(trinket.bonus_id)
			{
				trinket.bonus_level = 0;
				const bonus = trinket.bonus_id.split('/');
				for(let b = 0; b < bonus.length; ++b)
				{
					// values derived from bonus id list at https://gist.github.com/erorus/35705144b1a4ad015924
					if(bonus[b] >= 1372 && bonus[b] <= 1672)
						trinket.bonus_level += bonus[b] - 1472;
				}
				trinket.wowhead += '&bonus=' + trinket.bonus_id.replace(/\//g, ':');
			}
			if(ilevel_override.hasOwnProperty(trinket.id))
				trinket.item_level = ilevel_override[trinket.id];
			return trinket;
		};

		const parseSimCraft = function(input)
		{
			$window.localStorage.simCraft = input;
			ctrl.trinkets = [];
			const trinketEntries = /trinket\d=(\S+)/g;
			let trinket = null;
			const trinkets = [];
			do
			{
				trinket = trinketEntries.exec(input);
				if(!trinket) break;
				let attributes = trinket[1].split(',');
				const item = {};
				for(let i = 0; i < attributes.length; ++i)
				{
					if(!attributes[i]) continue;
					let attribute = attributes[i].split('=');
					if(attribute.length === 2)
						item[attribute[0]] = attribute[1];
				}
				trinkets.push(ParseTrinket(item));
			}
			while(trinket);
			$timeout(() => ctrl.trinkets = trinkets, 5);
		};


		$scope.$watch('$ctrl.simCraft', parseSimCraft);
		this.trinkets = [];
		this.simCraft = $window.localStorage.simCraft || '';
	}

	app.component(
		'trinketChart',
		{
			templateUrl: 'trinketChart.html',
			controller: TrinketChart,
			bindings: {
				trinkets: '<'
			},
		}
	);
	function TrinketChart($scope, $window, WarcraftPriests, $timeout)
	{
		const ctrl = this;

		// Dropdown for talent choice
		this.talents = [{id:'SC',label:'Shadow Crash'},{id:'AS',label:'Auspicious Spirits'}];
		this.talent = $window.localStorage.talent || 'SC';
		$scope.$watch('$ctrl.talent', load);

		// Dropdown for simulation style
		this.styles = [{id:'C',label:'Composite'},{id:'ST',label:'Single Target'},{id:'D',label:'Dungeon Slice'}];
		this.style = $window.localStorage.style || 'C';
		$scope.$watch('$ctrl.style', load);

		// Utility function to look up the name of a trinket
		this.nameOf = function(itemId)
		{
			if(trinketNames.hasOwnProperty(itemId))
				return trinketNames[itemId];

			if(!ctrl.data || !ctrl.data.item_ids)
				return null;

			for(let item in ctrl.data.item_ids)
			{
				if(ctrl.data.item_ids[item] === itemId * 1)
					return item;
			}
			return null;
		};

		this.availableTrinkets = {};
		function updateTrinketList()
		{
			// No data loaded yet, abort.
			if(!ctrl.trinkets || !ctrl.data || !ctrl.data.item_ids) return;

			// Loop through user supplied trinket list to add name and wowhead URLs
			for(let i = 0; i < ctrl.trinkets.length; ++i)
			{
				const trinket = ctrl.trinkets[i];
				const name = ctrl.nameOf(trinket.id);
				if(name)
				{
					trinket.name = name.replace(/_/g, ' ');
					ctrl.availableTrinkets[trinket.name] = trinket;
				}
			}
			generateChart();
		}

		this.chart = [];
		$scope.chartConfig = {
			chart: {
				type: 'bar',
				events: {
					redraw: () => $timeout(() => $window.$WowheadPower.refreshLinks(), 1)
				}
			},
			title: {
				text: 'Trinket Chart'
			},
			plotOptions: {
				series: {
					stacking: 'normal',
					dataLabels: {
						align: 'right',
						enabled: false,
						pointFormat: 'Value: {point.y:,.0f} mm'
					},
					enableMouseTracking: true,
					pointWidth: 15,
					spacing: 20,
					events: {
						legendItemClick: () => false
					},
					allowPointSelect: false
				}
			},
			xAxis: {
				categories: [],
				labels: {
					useHTML: true,
					align: 'right',
					reserveSpace: true,
					style: {
						'padding-right': '5px'
					},
				},
				events: {
					legendItemClick: () => false
				}
			},
			yAxis: {
				crosshair: {
					width: 3,
					snap: false,
					zIndex: 10
				},
				labels: {},
				stackLabels: {
					enabled: true,
				},
				gridLineColor: '#616c77',
				title: {
					text: 'Damage Per Second'
				}
			},
			legend: {
				layout: 'vertical',
				align: 'right',
				borderWidth: 1,
				floating: false,
				itemMarginBottom: 3,
				itemMarginTop: 0,
				reversed: true,
				shadow: false,
				verticalAlign: 'middle',
				x: 0,
				y: 0,
				title: {
					text: 'Item Level'
				},
				itemStyle: {
					fontWeight: 'bold'
				}
			},
			series: []
		};

		// Based on https://warcraftpriests.github.io/js/Chart_Building.js
		function generateChart()
		{
			if(!ctrl.data.sorted_data_keys) return;
			const trinkets = {};
			for(let i = 0; i < ctrl.data.sorted_data_keys.length; ++i)
			{
				const sorted = ctrl.data.sorted_data_keys[i];
				const trinket = ctrl.availableTrinkets[sorted];
				if(!trinket) continue;
				trinkets[sorted] = trinket;
			}

			const categories = [];
			for(const name in trinkets)
			{
				if(!trinkets.hasOwnProperty(name)) continue;
				const trinket = trinkets[name];

				categories.push(
					'<div style="display:inline-block;margin-bottom:-3px">' +
					'<a href="#" rel="' + trinket.wowhead + '" class="chart_link">' + trinket.name + '</a>' +
					'</div>'
				);
			}
			$scope.chartConfig.xAxis.categories = categories;

			const series = [];
			let itemLevels = ctrl.data.simulated_steps;
			for(const currIlevel of itemLevels)
			{
				let itemLevelDpsValues = [];
				for(const sortedData in trinkets)
				{
					const keys = [];
					if(!trinkets.hasOwnProperty(sortedData)) continue;

					const trinket = trinkets[sortedData];

					//Pull all item levels of the trinket.
					for(const k in ctrl.data.data[sortedData])
					{
						if(ctrl.data.data[sortedData].hasOwnProperty(k))
							keys.push(k);
					}

					let minItemLevel = keys[0] * 1;
					const itemLevel = (trinket.item_level || minItemLevel) + trinket.bonus_level;
					let dps = ctrl.data.data[sortedData][currIlevel];
					let baselineDPS = currIlevel === minItemLevel
						? ctrl.data.data.Base["300"] // If lowest ilvl is looked at, subtract base DPS
						: ctrl.data.data[sortedData][currIlevel - 5];

					const value = dps > 0 ? dps - baselineDPS : 0;
					const mine = currIlevel * 1 === itemLevel;
					itemLevelDpsValues.push(
						{
							y: value < 0 ? 0 : value,
							//color: mine ? '#00FF00' : null,
							selected: mine,
							name: currIlevel + ' * 1 === ' + itemLevel
						}
					);
				}
				series.push({
					data: itemLevelDpsValues,
					name: currIlevel,
					showInLegend: true
				});
			}
			$scope.chartConfig.series = series;
		}

		// Data from WarcraftPriests github page
		this.data = {item_ids:[]};
		this.loading = null;
		function load()
		{
			const chart = 'trinkets_'+ctrl.talent+'_'+ctrl.style+'.json';
			if(ctrl.loading === chart) return;
			ctrl.loading = chart;
			ctrl.data = WarcraftPriests.get({chart: chart}, function()
			{
				// No longer need the data, abort.
				if(chart !== ctrl.loading) return;
				updateTrinketList();
				ctrl.loading = null;
			});
		}

		// AngularJS framework hooks

		// User trinket list changes
		this.$onChanges = () => $timeout(updateTrinketList, 1);

		// Ready to start loading data
		this.$onInit = () => load();
	}
})();