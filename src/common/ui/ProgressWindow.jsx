/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2018 Center for History and New Media
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

window.Zotero = window.Zotero || {};
Zotero.UI = Zotero.UI || {};
Zotero.UI.style = Zotero.UI.style || {};

if (Zotero.isBookmarklet) {
	Zotero.UI.style.imageBase = ZOTERO_CONFIG.BOOKMARKLET_URL + "images/";
}
else if (typeof safari != 'undefined') {
	Zotero.UI.style.imageBase = safari.extension.baseURI + "images/";
}
else if (typeof browser != 'undefined') {
	Zotero.UI.style.imageBase = browser.extension.getURL("images/");
}
else if (typeof chrome != 'undefined') {
	Zotero.UI.style.imageBase = chrome.extension.getURL("images/");
}

function getTargetType(id) {
	return id.startsWith('L') ? 'library': 'collection';
}

Zotero.UI.ProgressWindow = class ProgressWindow extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = this.getInitialState();
		
		this.nArcs = 20;
		
		var translatorIssuesURL = "https://www.zotero.org/support/troubleshooting_translator_issues";
		this.text = {
			more: Zotero.getString('general_more'),
			done: Zotero.getString('general_done'),
			tagsPlaceholder: Zotero.getString('progressWindow_tagPlaceholder')
		};
		
		this.onMouseEnter = this.onMouseEnter.bind(this);
		this.onMouseLeave = this.onMouseLeave.bind(this);
		this.onUserInteraction = this.onUserInteraction.bind(this);
		this.onHeadlineSelectChange = this.onHeadlineSelectChange.bind(this);
		this.onDisclosureChange = this.onDisclosureChange.bind(this);
		this.onTargetChange = this.onTargetChange.bind(this);
		this.onTagsChange = this.onTagsChange.bind(this);
		this.onTagsKeyPress = this.onTagsKeyPress.bind(this);
		this.onTagsBlur = this.onTagsBlur.bind(this);
		this.onDone = this.onDone.bind(this);
	}
	
	getInitialState() {
		return {
			headlineText: "",
			target: null,
			targets: null,
			targetSelectorShown: false,
			tags: "",
			itemProgress: new Map(),
			errors: []
		};
	}
	
	componentDidMount() {
		for (let evt of ['changeHeadline', 'makeReadOnly', 'updateProgress', 'addError']) {
			Zotero.Messaging.addMessageListener(`progressWindowIframe.${evt}`, (data) => this[evt](...data));
		}
		Zotero.Messaging.addMessageListener('progressWindowIframe.hidden', this.onHidden.bind(this));
		Zotero.Messaging.addMessageListener('progressWindowIframe.reset', () => this.setState(this.getInitialState()));
		
		// Preload other disclosure triangle state
		(new Image()).src = 'disclosure-open.svg';
		
		// Focus the content window after initialization so that keyboard navigation works
		this.rootNode.click();
		if (this.headlineSelectNode) {
			// Does this work?
			this.headlineSelectNode.focus();
		}
		
		this.sendMessage('registered');
	}
	
	
	// Let the parent window know it has to resize the iframe
	componentDidUpdate() {
		window.requestAnimationFrame(() => {
			if (this.lastHeight != this.rootNode.scrollHeight
					// In Firefox this ends up being 0 when the pane closes
					&& this.rootNode.scrollHeight != 0) {
				this.lastHeight = this.rootNode.scrollHeight;
				this.sendMessage('resized', { height: this.rootNode.scrollHeight });
			}
		});
	}
	
	
	//
	// State update
	//
	changeHeadline(text, target, targets) {
		this.setState({
			headlineText: text,
			target,
			targets
		});
	}
	
	makeReadOnly(target) {
		this.setState({
			targetSelectorShown: false,
			target,
			targets: null
		});
	}
	
	updateProgress(id, params = {}) {
		// Assign a random id if not provided. This row won't be able to be updated.
		if (!id) {
			id = Math.floor(Math.random() * 99999999);
		}
		
		this.setState((prevState, props) => {
			var iconSrc = params.iconSrc;
			var title = params.title;
			var parentItem = params.parentItem;
			var progress = params.progress;
			
			var newState = {
				itemProgress: new Map(prevState.itemProgress)
			};
			
			var p = prevState.itemProgress.get(id);
			if (!p) {
				p = {id, iconSrc, title};
				newState.itemProgress.set(id, p);
				p.order = prevState.itemProgress.size - 1;
			}
			if (iconSrc) {
				p.iconSrc = iconSrc;
			}
			if (parentItem) {
				p.parentItem = parentItem;
			}
			if (progress === false) {
				p.failed = true;
			}
			else if (typeof progress == 'number') {
				p.percentage = progress;
			}
			return newState;
		});
	}
	
	addError() {
		this.setState((prevState) => {
			return {
				errors: prevState.errors.concat([Array.from(arguments)])
			};
		});
	}
	
	focusTree() {
		var focused = document.querySelector('.focused');
		if (focused) {
			focused.click();
		}
	}
	
	//
	// Messaging
	//
	sendMessage(event, data = {}) {
		Zotero.Messaging.sendMessage(`progressWindowIframe.${event}`, data);
	}
	
	sendUpdate() {
		this.sendMessage('updated', { target: this.target, tags: this.tags });
	}
	
	//
	// Handlers
	//
	onMouseEnter() {
		this.sendMessage('mouseenter');
	}
	
	onMouseLeave() {
		this.sendMessage('mouseleave');
	}
	
	onUserInteraction() {
		// After the user has interacted with the popup, let the parent know when the document
		// is blurred in case it wants to close the frame
		document.body.onblur = this.onDocumentBlur.bind(this);
	}
	
	onDocumentBlur() {
		document.body.onblur = null;
		this.sendMessage('blurred');
	}
	
	onHeadlineSelectChange(event) {
		if (event.target.value == 'more') {
			this.setState({
				targetSelectorShown: true
			});
			setTimeout(() => this.focusTree(), 100);
			return;
		}
		
		// TODO: Choose recent
		this.onTargetChange(event.target.value);
	}
	
	onDisclosureChange() {
		this.onUserInteraction();
		
		this.setState((prevState, props) => {
			if (!prevState.targetSelectorShown) {
				setTimeout(() => this.focusTree(), 100);
			}
			return {
				targetSelectorShown: !prevState.targetSelectorShown
			};
		});
	}
	
	onTargetChange(id) {
		this.onUserInteraction();
		
		var target = this.state.targets.find(row => row.id == id);
		this.setState({target});
		this.target = target;
		this.sendUpdate();
	}
	
	onTagsChange(event) {
		this.setState({tags: event.target.value});
		this.tags = event.target.value;
	}
	
	onTagsKeyPress(event) {
		// Commit tags and close popup on Enter
		if (event.which == 13) {
			this.sendUpdate();
			this.onDone();
		}
	}
	
	onTagsBlur() {
		this.sendUpdate();
	}
	
	onDone() {
		this.headlineSelectNode.focus();
		this.sendMessage('close');
	}
	
	onHidden() {
	}
	
	//
	// Render
	//
	renderHeadline() {
		return (
			<div className="ProgressWindow-headline">
				{this.state.headlineText}
				{this.state.targets
					? this.renderHeadlineSelect()
					: (this.state.target ? this.renderHeadlineTarget() : "")}
			</div>
		);
	}
	
	renderHeadlineSelect() {
		var rowTargets = [
			this.state.target,
			// Show recent targets
			...this.state.targets.filter(t => t.recent && t.id != this.state.target.id)
		];
		if (!this.state.targetSelectorShown) {
			rowTargets.push({
				id: "more",
				name: this.text.more
			});
		}
		
		return (
			<div className="ProgressWindow-headlineSelectContainer">
				<select ref={(el) => {this.headlineSelectNode = el}}
						className="ProgressWindow-headlineSelect"
						onFocus={this.onUserInteraction}
						onChange={this.onHeadlineSelectChange}
						value={this.state.target.id}>
					{rowTargets.map((row) => {
						var props = {
							key: row.id,
							value: row.id,
							disabled: row.disabled
						};
						return <option {...props}>{row.name}</option>;
					})}
				</select>
				<button className={"ProgressWindow-disclosure"
							+ (this.state.targetSelectorShown ? " is-open" : "")}
						onClick={this.onDisclosureChange} />
			</div>
		);
	}
	
	
	/**
	 * Image and target name (old client that doesn't provide collections)
	 */
	renderHeadlineTarget() {
		return <React.Fragment>
			<TargetIcon type={getTargetType(this.state.target.id)}/>
			{" " + this.state.target.name + "…"}
		</React.Fragment>;
	}
	
	renderTargetSelector() {
		return (
			this.state.targetSelectorShown
			? <div>
				<div className="ProgressWindow-targetSelector">
					<TargetTree
						rows={this.state.targets}
						focused={this.state.targets.find(row => row.id == this.state.target.id)}
						onRowFocus={this.onTargetChange} />
				</div>
				<div className="ProgressWindow-inputRow ProgressWindow-targetSelectorTagsRow">
					<input className="ProgressWindow-tagsInput"
						type="text"
						value={this.state.tags}
						placeholder={this.text.tagsPlaceholder}
						onClick={this.onUserInteraction}
						onChange={this.onTagsChange}
						onKeyPress={this.onTagsKeyPress}
						onBlur={this.onTagsBlur} />
					<button className="ProgressWindow-button" onClick={this.onDone}>{this.text.done}</button>
				</div>
			</div>
			: ""
		);
	}
	
	/**
	 * Container for item progress lines
	 */
	renderProgress() {
		// Sort items by order, and then sort child items under parents
		var items = Array.from(this.state.itemProgress.values());
		items.sort((a, b) => a.order - b.order);
		var childItems = items.filter(item => item.parentItem);
		items = items.filter(item => !item.parentItem);
		var newItems = [];
		for (let item of items) {
			newItems.push(item);
			while (childItems.length && item.id == childItems[0].parentItem) {
				newItems.push(childItems.shift());
			}
		}
		items = newItems;
		
		return (
			<div className="ProgressWindow-progressBox">
				{items.map(item => this.renderItem(item))}
			</div>
		);
	}
	
	/**
	 * Item progress lines
	 */
	renderItem(item) {
		var itemStyle = Object.assign(
			{},
			// Start at 50% opacity
			{
				opacity: (item.percentage || 0) / 200 + .5
			},
			item.parentItem && {
				marginTop: "4px",
				marginLeft: "12px"
			},
			item.failed && {
				opacity: "1",
				color: "red"
			}
		);
		var iconStyle = Object.assign(
			{},
			// Indent child items
			{
				left: `${item.parentItem ? '22' : '12'}px`
			},
			item.failed && {
				backgroundImage: `url('${Zotero.UI.style.imageBase}cross.png')`,
				backgroundPosition: ""
			},
			// Use circular indicator for partial progress
			item.percentage && item.percentage != 100 && {
				backgroundImage: `url('${Zotero.UI.style.imageBase}progress_arcs.png')`,
				backgroundPosition: "-" + (Math.round(item.percentage / 100 * this.nArcs) * 16) + "px 0",
				backgroundSize: "auto"
			},
			// Show item type icon on completion
			(!item.failed && (!item.percentage || item.percentage == 100)) && {
				backgroundImage: `url('${item.iconSrc}')`,
				backgroundPosition: "",
				backgroundSize: "contain"
			},
		);
		
		return (
			<div key={item.id} className="ProgressWindow-item" style={itemStyle}>
				<div className="ProgressWindow-itemIcon" style={iconStyle}></div>
				<div className="ProgressWindow-itemText">
					{item.title}
				</div>
			</div>
		);
	}
	
	renderErrors() {
		return (
			<div className="ProgressWindow-errors">
				{this.state.errors.map((row, index) => this.renderError(row, index))}
			</div>
		);
	}
	
	renderError(row, index) {
		var err = row[0];
		var args = row.slice(1);
		
		var contents = "";
		
		if (err === "translationError") {
			let url = "https://www.zotero.org/support/troubleshooting_translator_issues";
			let pageName = Zotero.getString('progressWindow_error_troubleshootingTranslatorIssues');
			let pageLink = `<a href="${url}" title="${url}">${pageName}</a>`;
			let html = {
				__html: Zotero.getString("progressWindow_error_translation", pageLink)
			};
			contents = <span dangerouslySetInnerHTML={html}/>;
		}
		else if (err === "fallback") {
			let t1 = `<b>${args[0]}</b>`
			let t2 = `<b>${args[1]}</b>`
			let html = {
				__html: Zotero.getString('progressWindow_error_fallback', [t1, t2])
			};
			contents = <span dangerouslySetInnerHTML={html}/>;
		}
		else if (err === "noTranslator") {
			contents = "No items could be saved because this website "
				+ "is not supported by any Zotero translator. If Zotero is not open, try opening "
				+ "it to increase the number of supported sites.";
		}
		else if (err === "collectionNotEditable") {
			contents = "The currently selected collection is not editable. "
				+ "Please select a different collection in Zotero.";
		}
		else if (err === "clientRequired") {
			contents = "This item could not be saved because Zotero is not open or is unreachable. "
				+ "Please open Zotero and try again.";
		}
		else if (err === "upgradeClient") {
			let url = ZOTERO_CONFIG.CLIENT_DOWNLOAD_URL;
			let pageName = Zotero.getString('progressWindow_error_upgradeClient_latestVersion');
			let pageLink = `<a href="${url}" title="${url}">${pageName}</a>`;
			let html = {
				__html: Zotero.getString("progressWindow_error_upgradeClient", pageLink)
			};
			contents = <span dangerouslySetInnerHTML={html}/>;
		}
		else if (err === "unexpectedError") {
			let url = "https://www.zotero.org/support/getting_help";
			contents = <span>
				An error occurred while saving this item. Try again, and if the issue persists
				see <a href={url} title={url}>Getting Help</a> for more information.
			</span>;
		}
		
		return (
			<div className="ProgressWindow-error" key={index}>
				{contents}
			</div>
		);
	}
	
	render() {
		return (
			<div ref={(el) => {this.rootNode = el}}
					className="ProgressWindow-box"
					onMouseEnter={this.onMouseEnter}
					onMouseLeave={this.onMouseLeave}>
				{this.renderHeadline()}
				{this.renderTargetSelector()}
				{this.renderProgress()}
				{this.renderErrors()}
			</div>
		);
	}
}


class TargetIcon extends React.Component {
	render() {
		var image = this.props.type == 'library'
			? "treesource-library.png"
			: "treesource-collection.png";
		var style = {
			backgroundImage: `url('${Zotero.UI.style.imageBase}${image}')`
		};
		return <div className="ProgressWindow-targetIcon" style={style} />;
	}
}


class TargetTree extends React.Component {
	/*static get propTypes() {
		return {
			rows: PropTypes.object.isRequired
		};
	}*/
	
	constructor(props) {
		super(props);
		
		this.state = {
			expanded: {}
		};
	}
	
	getRoots() {
		return this.props.rows.filter(row => !row.level);
	}
	
	getParent(id) {
		var rows = this.props.rows;
		var pos = rows.findIndex(row => row.id == id);
		var row = rows[pos];
		var level = row.level;
		if (!level) return null;
		while (true) {
			pos--;
			// This shouldn't happen unless a root is missing
			if (!rows[pos]) {
				return pos + 1;
			}
			// If item's level is one below the current one or is a root, that's the parent
			if (rows[pos].level == level - 1 || !rows[pos].level) {
				return pos;
			}
		}
	}
	
	getChildren(id) {
		var rows = this.props.rows;
		var pos = rows.findIndex(row => row.id == id);
		var row = rows[pos];
		var level = row.level || 0;
		var children = [];
		while (rows[++pos] && rows[pos].level > level) {
			if (rows[pos].level == level + 1) {
				children.push(rows[pos]);
			}
		}
		return children;
	}
	
	itemIsExpanded(id) {
		return !!this.state.expanded[id];
	}
	
	onRowToggle(item) {
		var id = item.id;
		this.setState((prevState) => {
			return {
				expanded: Object.assign(
					{},
					prevState.expanded,
					{
						[id]: !prevState.expanded[id]
					}
				)
			};
		});
	}
	
	onRowExpand(item) {
		var id = item.id;
		this.setState((prevState) => {
			return {
				expanded: Object.assign(
					{},
					prevState.expanded,
					{
						[id]: true
					}
				)
			};
		});
	}
	
	onRowCollapse(item) {
		var id = item.id;
		this.setState((prevState) => {
			return {
				expanded: Object.assign(
					{},
					prevState.expanded,
					{
						[id]: false
					}
				)
			};
		});
	}
	
	onRowFocus(item) {
		if (!item) {
			return;
		}
		var id = item.id;
		this.props.onRowFocus(id);
	}
	
	render() {
		return React.createElement(
			Tree,
			{
				itemHeight: 20, // px
				
				getRoots: () => this.getRoots(),
				getKey: item => item.id,
				getParent: item => this.getParent(item.id),
				getChildren: item => this.getChildren(item.id),
				isExpanded: item => this.itemIsExpanded(item.id),
				
				renderItem: (item, depth, isFocused, arrow, isExpanded) => {
					let className = "";
					if (isFocused) {
						className += "focused";
					}
					
					return (
						<div className={className} style={{marginLeft: depth * 5 + "px"}}>
							{/* Add toggle on arrow click, since we disabled it in tree.js for
							    clicking on the row itself. If the tree is updated to have less
							    annoying behavior, this can be reverted. */}
							<span onClick={() => this.onRowToggle(item)}>{arrow}</span>
							<TargetIcon type={getTargetType(item.id)} />
							<span className="tree-item-label">{item.name}</span>
						</div>
					);
				},
				
				focused: this.props.focused,
				
				onFocus: item => this.onRowFocus(item),
				onExpand: item => this.onRowExpand(item),
				onCollapse: item => this.onRowCollapse(item),
				
				autoExpandAll: true,
				autoExpandDepth: 1
			}
		);
	}
}
