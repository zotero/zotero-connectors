/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
					George Mason University, Fairfax, Virginia, USA
					http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

var Zotero_Preferences_Config = {
	init: function() {
		Zotero.Messaging.init();
		Zotero.Prefs.getAll().then(function(prefs) {
			this.table = <Zotero_Preferences_Config.Table prefs={prefs}/>;
			ReactDOM.render(this.table, document.getElementById('table'));
		}.bind(this));
	}
};

Zotero_Preferences_Config.Table = React.createClass({
	getInitialState() {
		return {filter: ''};
	},

	filter(event) {
		this.setState({filter: event.target.value});
	},

	render() {
		let rows = [];
		let keys = Object.keys(this.props.prefs).sort();
		if (this.state.filter.length) {
			keys = keys.filter((k) => k.includes(this.state.filter));
		}
		for (let key of keys) {
			rows.push(<Zotero_Preferences_Config.Row name={key} key={key}/>)
		}
		return (
			<div>
				<input className="form-control" type="search" placeholder="Filter" onChange={this.filter}/>
				<table className="table table-hover">
					<thead>
						<tr>
							<th width="25%">Preference</th>
							<th width="75%">Value</th>
						</tr>
					</thead>
					<tbody>{rows}</tbody>
				</table>
			</div>
		)
	}
});

Zotero_Preferences_Config.Row = React.createClass({
	getInitialState() {
		return {};
	},
	
	edit() {
		Zotero.Prefs.getAsync(this.props.name).then(function(value) {
		if (typeof value == 'object') value = JSON.stringify(value);
		
		if (typeof value == 'boolean') {
			value = `${!value}`;
		} else {
			value = window.prompt('', value);
			if (value === null) return;
		}
		try {
			var parsedValue = JSON.parse(value);
		} catch (e) {
			parsedValue = value;
		}
		Zotero.Prefs.set(this.props.name, parsedValue);
		this.setState({value});	
		}.bind(this));
	},

	componentDidMount() {
		Zotero.Prefs.getAsync(this.props.name).then(function(value) {
			if (typeof value != 'string') {
				value = JSON.stringify(value);
			}
			this.setState({value});
		}.bind(this));
	},
	
	render() {
		return (
			<tr onDoubleClick={this.edit} data-name={this.props.name} className="config-row">
				<td>{this.props.name}</td>
				<td>{this.state.value}</td>
			</tr>
		)
	}
});

Zotero_Preferences_Config.init();