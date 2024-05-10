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

Zotero.UI.style.imageBase = Zotero.getExtensionURL("images/");

function getTargetType(id) {
	return id.startsWith('L') ? 'library': 'collection';
}

function getParent(rows, id) {
	var pos = rows.findIndex(row => row.id == id);
	var row = rows[pos];
	var level = row.level;
	if (!level) return null;
	while (true) {
		pos--;
		// This shouldn't happen unless a root is missing
		if (!rows[pos]) {
			return rows[pos + 1];
		}
		// If item's level is one below the current one or is a root, that's the parent
		if (rows[pos].level == level - 1 || !rows[pos].level) {
			return rows[pos];
		}
	}
}

Zotero.UI.ProgressWindow = class ProgressWindow extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = this.getInitialState();
		
		this.nArcs = 20;
		this.announceAlerts = false;
		this.alertTimeout = null;
		
		this.text = {
			more: Zotero.getString('general_more'),
			done: Zotero.getString('general_done'),
			tagsPlaceholder: Zotero.getString('progressWindow_tagPlaceholder'),
			filterPlaceholder: Zotero.getString('progressWindow_filterPlaceholder')
		};
		
		this.expandedRowsCache = {};
		
		this.headlineSelectNode = React.createRef();
		
		this.handleMouseEnter = this.handleMouseEnter.bind(this);
		this.handleMouseLeave = this.handleMouseLeave.bind(this);
		this.handleUserInteraction = this.handleUserInteraction.bind(this);
		this.handleHeadlineSelectFocus = this.handleHeadlineSelectFocus.bind(this);
		this.onHeadlineSelectChange = this.onHeadlineSelectChange.bind(this);
		this.onDisclosureChange = this.onDisclosureChange.bind(this);
		this.handleDisclosureKeyPress = this.handleDisclosureKeyPress.bind(this);
		this.onTargetChange = this.onTargetChange.bind(this);
		this.handleExpandRows = this.handleExpandRows.bind(this);
		this.handleCollapseRows = this.handleCollapseRows.bind(this);
		this.handleRowToggle = this.handleRowToggle.bind(this);
		this.handleKeyDown = this.handleKeyDown.bind(this);
		this.handleKeyPress = this.handleKeyPress.bind(this);
		this.onTagsChange = this.onTagsChange.bind(this);
		this.onTagsKeyPress = this.onTagsKeyPress.bind(this);
		this.onTagsFocus = this.onTagsFocus.bind(this);
		this.onTagsBlur = this.onTagsBlur.bind(this);
		this.handleDone = this.handleDone.bind(this);
		this.setFilter = this.setFilter.bind(this);
		this.clearFilter = this.clearFilter.bind(this);
		this.expandToTarget = this.expandToTarget.bind(this);
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
			this.addMessageListener(`progressWindowIframe.${evt}`, (data) => this[evt](...data));
		}
		this.addMessageListener('progressWindowIframe.shown', this.handleShown.bind(this));
		this.addMessageListener('progressWindowIframe.hidden', this.handleHidden.bind(this));
		this.addMessageListener('progressWindowIframe.reset', () => this.setState(this.getInitialState()));
		
		document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
		
		// Preload other disclosure triangle state
		(new Image()).src = 'disclosure-open.svg';
		
		this.sendMessage('registered');
		
		document.querySelector("#progress-window").setAttribute("aria-label", Zotero.getString('general_saveTo', 'Zotero'));
	}
	
	
	componentDidUpdate() {
		// Focus the recents drop-down
		if (this.focusHeadlineSelect) {
			this.focusHeadlineSelect = false;
			if (this.headlineSelectNode.current) {
				// Don't count this focus as a user interaction
				this.ignoreHeadlineSelectFocus = true;
				this.headlineSelectNode.current.focus();
			}
		}
		// Focus the focused tree
		else if (this.focusTreeOnUpdate) {
			this.focusTreeOnUpdate = false;
			// This is a hacky approach, but figuring out when the focused tree row was rendered
			// would be way more convoluted.
			setTimeout(function () {
				var focused = document.querySelector('.focused');
				if (focused) {
					focused.click();
				}
			}, 100);
		}
		
		// Let the parent window know it has to resize the iframe
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
		// Target selector mode
		if (targets) {
			// On initialization or if collapsed, focus the recents drop-down
			if (!this.state.targets || !this.state.targetSelectorShown) {
				this.focusHeadlineSelect = true;
			}
			
			// Auto-expand libraries
			targets.forEach((t) => {
				if (getTargetType(t.id) == 'library') {
					t.expanded = true;
				}
			});
			
			// Expand to selected node
			this.expandToTarget(targets, target);

			// Record which rows are expanded so they're not collapsed in setFilter()
			for (let row of targets) {
				this.expandedRowsCache[row.id] = row.expanded;
			}
		}
		
		var state = {
			headlineText: text,
			target,
			targets
		};
		// If client is closed after a successful save with the target selector open and then the
		// button is clicked again and save-to-server is enabled, we need to collapse the pane
		if (!targets) {
			state.targetSelectorShown = false;
		}
		// Alert that the item is being saved
		document.getElementById("messageAlert").textContent = `${text} ${target.name}`;
		this.setState(state, () => {
			this.setFilter();
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
			p.title = title;
			if (iconSrc) {
				p.iconSrc = iconSrc;
			}
			if (parentItem) {
				p.parentItem = parentItem;
			}
			if (progress === false) {
				p.failed = true;
			}
			// Just remove the line if an optional PDF wasn't found
			else if (progress == -1) {
				newState.itemProgress.delete(id);
			}
			else if (typeof progress == 'number') {
				p.percentage = progress;
			}
			if (params.itemType) {
				p.itemType = params.itemType
			}
			return newState;
		});
		// Do not being announcing alerts until all top level items are loaded
		if (!this.announceAlerts) {
			this.announceAlerts = params.itemsLoaded;
		}
	}
	
	addError() {
		this.setState((prevState) => {
			let errors = [...prevState.errors];
			let newError = Array.from(arguments);
			// Add error if new
			if (!errors.find(e => JSON.stringify(e) == JSON.stringify(newError))) {
				errors.push(newError);
			}
			return { errors };
		});
	}
	
	// For screenreader accessibility, announce alerts as items are saved/downloaded
	handleAlerts(items) {
		clearTimeout(this.alertTimeout);
		let toplevelItems = items.filter(item => !item.parentItem && item.percentage == 100);
		// Do not announce anything until all top level items are saved
		if (!this.announceAlerts || toplevelItems.length == 0) return;
		// Generate the first top level message "Saving X items ..."
		let shortenTitle = (title) => title.split(/\s+/).slice(0, 5).join(' ');
		let alertQueue = [];
		let savingMultipleItems = toplevelItems.length > 1;
		if (savingMultipleItems) {
			let topLevelTitles = toplevelItems.map((item, index) => Zotero.getString("progressWindow_saveItem", [index + 1, shortenTitle(item.title)])).join(", ");
			alertQueue = [{ text: Zotero.getString("progressWindow_savingItems", [this.announceAlerts, topLevelTitles]), id: 'saving_items_count' }];
		}
		else {
			alertQueue = [{ text: Zotero.getString("progressWindow_savingItem", shortenTitle(toplevelItems[0].title)), id: 'saving_items_count' }];
		}
		let parentItemIndex = 0;
		// Generate messages about attachments and notes
		for (let { parentItem, percentage, id, itemType } of items) {
			let message;
			if (parentItem) {
				// Attachments being downloaded
				if (percentage === false) {
					message = Zotero.getString(`progressWindow_downloadFailed${savingMultipleItems ? "Plural" : ""}`, [itemType, parentItemIndex]);
				}
				else if (percentage === 100) {
					message = Zotero.getString(`progressWindow_downloadComplete${savingMultipleItems ? "Plural" : ""}`, [itemType, parentItemIndex]);
				}
			}
			else if (percentage === 100) {
				// Parent item has been saved
				parentItemIndex += 1;
			}
			if (message) {
				alertQueue.push({text: message, id: id});
			}
		}
		
		// Debounce the updates
		let timeoutExists = this.alertTimeout !== null;
		this.alertTimeout = setTimeout(() => {
			let logNode = document.getElementById("messageLog");
			for (let { text, id } of alertQueue) {
				// Make sure a message is not appended twice
				if(logNode.querySelector(`[value='${text}']`)) continue;

				// Insert new log entry
				let div = document.createElement("div");
				div.setAttribute("data-id", id);
				div.setAttribute("value", text);
				div.textContent = text;
				logNode.appendChild(div);
			}
		}, timeoutExists ? 0 : 1000);
	}

	//
	// Messaging
	//
	sendMessage(name, data = {}) {
		return Zotero.Messaging.sendMessage(`progressWindowIframe.${name}`, data);
	}

	addMessageListener(name, handler) {
		return Zotero.Messaging.addMessageListener(name, handler);
	}
	
	sendUpdate() {
		this.sendMessage('updated', { target: this.target, tags: this.tags });
	}
	
	//
	// Handlers
	//
	handleShown() {
		// If previously hidden and now reopened with the target selector shown, focus the tree
		if (this.state.targetSelectorShown) {
			this.focusTreeOnUpdate = true;
		}
	}
	
	handleHidden() {
	}
	
	handleMouseEnter() {
		this.sendMessage('mouseenter');
	}
	
	handleMouseLeave() {
		this.sendMessage('mouseleave');
	}
	
	handleMouseMove() {
		this.sendMessage('mousemove');
	}
	
	handleVisibilityChange() {
		// When the tab becomes visible, check whether the mouse is over the frame and trigger a
		// mouseenter/mouseleave accordingly. We don't trigger a mouseleave when the tab becomes
		// hidden so that the popup doesn't change state in the background, but we skip the
		// delaySync() request in the setInterval() in progressWindow_inject.js when it's hidden.
		if (!document.hidden) {
			// This is a hack to synchronously check whether we're over the iframe, using a no-op
			// CSS property on hover
			let hovering = window.getComputedStyle(this.rootNode)
				.getPropertyValue('background-size') == 'cover';
			if (hovering) {
				this.handleMouseEnter();
			}
			else {
				this.handleMouseLeave();
			}
		}
	}
	
	handleUserInteraction() {
		// After the user has interacted with the popup, let the parent know when the document
		// is blurred in case it wants to close the frame
		document.body.onblur = this.onDocumentBlur.bind(this);
	}
	
	onDocumentBlur() {
		document.body.onblur = null;
		this.sendMessage('blurred');
	}
	
	handleHeadlineSelectFocus() {
		// The select sometimes gets auto-focused, and we don't want to count those as user interaction
		if (this.ignoreHeadlineSelectFocus) {
			this.ignoreHeadlineSelectFocus = false;
			return;
		}
		this.handleUserInteraction();
	}
	
	onHeadlineSelectChange(event) {
		if (event.target.value == 'more') {
			this.focusTreeOnUpdate = true;
			this.setState({
				targetSelectorShown: true
			});
			return;
		}
		
		// TODO: Choose recent
		this.onTargetChange(event.target.value);
	}
	
	onDisclosureChange() {
		var show = !this.state.targetSelectorShown;
		if (show) {
			this.focusTreeOnUpdate = true;
		}
		this.setState({
			targetSelectorShown: show
		});
	}
	
	handleDisclosureKeyPress(event) {
		if (event.key == 'Enter') {
			event.stopPropagation();
		}
	}
	
	onTargetChange(id) {
		var target = this.state.targets.find(row => row.id == id);
		this.setState({target});
		this.target = target;
		this.handleUserInteraction();
		this.sendUpdate();
	}
	
	handleExpandRows(ids) {
		ids = new Set(ids);
		this.setState((prevState) => {
			return {
				targets: [...prevState.targets.map((target) => {
					return ids.has(target.id)
						? Object.assign({}, target, { expanded: true })
						: target;
				})]
			};
		});
	}
	
	handleCollapseRows(ids) {
		ids = new Set(ids);
		this.setState((prevState) => {
			return {
				targets: [...prevState.targets.map((target) => {
					return ids.has(target.id)
						? Object.assign({}, target, { expanded: false })
						: target;
				})]
			};
		});
	}
	
	handleRowToggle(id) {
		this.setState((prevState) => {
			return {
				targets: [...prevState.targets.map((target) => {
					if (target.id != id) return target;
					return Object.assign({}, target, { expanded: !target.expanded });
				})]
			};
		});
	}
	
	/**
	 * Expand all parent rows of the selected row
	 */
	expandToTarget(targets, target) {
		let parent = getParent(targets, target.id);
		while (parent) {
			if (parent.expanded) {
				break;
			}
			parent.expanded = true;
			parent = getParent(targets, parent.id);
		}
	}
	handleKeyDown(event) {
		if (event.target.classList.contains("ProgressWindow-filterInput")) {
			// Escape from a non-empty collections filter just clears it 
			if (event.key == 'Escape' && event.target.value.length > 0) {
				this.clearFilter();
				return;
			}
			// Tab from collections filter will select the first passing row
			// if the currently selected row is filtered out
			if (event.key == "Tab" && !event.shiftKey) {
				var target = this.state.targets.find(row => row.id == this.state.target.id);
				if (!target.passesFilter) {
					let firstPassingTarget = this.state.targets.find(row => row.passesFilter);
					if (firstPassingTarget) {
						this.onTargetChange(firstPassingTarget.id);
					}
				}
			}
		}
		if (event.key == 'Escape') {
			this.handleDone();
		}
		// Consider directional navigation of the drop-down equivalent to clicking in the popup
		else if (event.target.localName == 'select') {
			switch (event.key) {
				case 'ArrowUp':
				case 'ArrowDown':
				case 'Home':
				case 'End':
					this.sendMessage('mouseenter');
					this.handleUserInteraction();
					break;
			}
		}
	}
	
	handleKeyPress(event) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		
		if (event.key == 'Enter') {
			this.handleDone();
		}
		// Consider keyboard navigation of the drop-down equivalent to clicking in the popup
		else {
			this.sendMessage('mouseenter');
			this.handleUserInteraction();
		}
	}
	
	onTagsChange(event) {
		this.setState({tags: event.target.value});
		this.tags = event.target.value;
	}
	
	onTagsKeyPress(event) {
		// Commit tags and close popup on Enter
		if (event.which == 13) {
			this.sendUpdate();
			this.handleDone();
		}
	}
	
	onTagsFocus() {
		this.sendMessage('tagsfocus');
	}
	
	onTagsBlur() {
		this.sendMessage('tagsblur');
		this.sendUpdate();
	}
	
	handleDone() {
		//this.headlineSelectNode.current.focus();
		this.sendMessage('close');
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
				<div id="messageAlert" role="alert" style={{ fontSize: 0 }}/>
				<div id="messageLog" role="log" aria-relevant="additions" style={{ fontSize: 0 }}/>
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
			<React.Fragment>
				<select ref={this.headlineSelectNode}
						className="ProgressWindow-headlineSelect"
						onFocus={this.handleHeadlineSelectFocus}
						onChange={this.onHeadlineSelectChange}
						value={this.state.target.id}
						aria-label={this.state.headlineText || ""}>
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
						onClick={this.onDisclosureChange}
						onKeyPress={this.handleDisclosureKeyPress}
						aria-expanded={this.state.targetSelectorShown}
						aria-label={Zotero.getString(`progressWindow_detailsBtn${this.state.targetSelectorShown ? "Hide" : "View"}`)}/>
			</React.Fragment>
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


	/**
	 * Clear the value of the collections filter and display all rows
	 */
	clearFilter() {
		let filter = document.querySelector('.ProgressWindow-filterInput');
		if (!filter) {
			return;
		}
		filter.value = "";
		this.setFilter();
		filter.focus();
	}
	
	setFilter() {
		let filter = document.querySelector('.ProgressWindow-filterInput')?.value || "";
		let crossIcon = document.querySelector(".ProgressWindow-cross");
		filter = filter.toLowerCase();
		let isFilterEmpty = filter.length == 0;
		// Show the cross icon only when the filter is non-empty
		if (crossIcon) {
			if (isFilterEmpty) {
				crossIcon.classList.add("hidden");
			}
			else {
				crossIcon.classList.remove("hidden");
			}
		}
		let passingIDs = {};
		let passingParentIDs = {};
		let rows = this.state.targets;
		if (!isFilterEmpty && Object.keys(this.expandedRowsCache).length == 0) {
			// Just started filtering - remember which rows were expanded
			for (let row of rows) {
				this.expandedRowsCache[row.id] = row.expanded;
			}
		}
		// Go through the rows from the bottom to the top
		for (let i = rows.length - 1; i >= 0; i--) {
			let row = rows[i];
			let isPassing = row.name.toLowerCase().includes(filter);
			// If a row passes the filter, record it
			if (isFilterEmpty || isPassing || passingParentIDs[row.id]) {
				if (isPassing) {
					passingIDs[row.id] = true;
				}
				// Find the row's immediate parent and mark it as a parent of a passing item
				let maybeParenIndex = i - 1;
				while (maybeParenIndex >= 0 && rows[maybeParenIndex].level >= row.level) {
					maybeParenIndex -= 1;
				}
				let maybeParent = rows[maybeParenIndex];
				if (maybeParent && maybeParent.level == row.level - 1) {
					passingParentIDs[maybeParent.id] = true;
				}
			}
		}
		// Re-render the collections with updated filter statuses
		this.setState((prevState) => {
			return {
				targets: [...prevState.targets.map((target) => {
					let updated = Object.assign({}, target, {
						passesFilter: !!passingIDs[target.id],
						passingParent: !!passingParentIDs[target.id]
					});
					if (!isFilterEmpty) {
						// Expand all visible rows during filtering
						updated.expanded = true;
					}
					else {
						// Filter was cleared: each row's expanded status is restored
						// to what it was before filtering
						updated.expanded = !!this.expandedRowsCache[target.id];
					}
					return updated;
				})]
			};
		}, () => {
			if (isFilterEmpty && Object.keys(this.expandedRowsCache).length > 0) {
				// Filter was cleared: empty the expanded rows cache
				this.expandedRowsCache = {};
				// Ensure that the selected row's parent's are not collapsed 
				this.expandToTarget(this.state.targets, this.state.target);
			}
		});
	}
	
	renderTargetSelector() {
		return (
			this.state.targetSelectorShown
			? <div>
				<div className="ProgressWindow-filterWrapper">
					<input
						className="ProgressWindow-filterInput"
						onInput={this.setFilter}
						placeholder={this.text.filterPlaceholder}>
					</input>
					<button className="ProgressWindow-cross hidden"
							onClick={this.clearFilter}
							tabindex={-1}/>
				</div>
				<div className="ProgressWindow-targetSelector">
					<TargetTree
						rows={this.state.targets.filter(target => target.passesFilter || target.passingParent)}
						focused={this.state.targets.find(row => row.id == this.state.target.id)}
						onExpandRows={this.handleExpandRows}
						onCollapseRows={this.handleCollapseRows}
						onRowToggle={this.handleRowToggle}
						onRowFocus={this.onTargetChange}/>
				</div>
				<div className="ProgressWindow-inputRow ProgressWindow-targetSelectorTagsRow">
					<input className="ProgressWindow-tagsInput"
						type="text"
						value={this.state.tags}
						placeholder={this.text.tagsPlaceholder}
						onChange={this.onTagsChange}
						onKeyPress={this.onTagsKeyPress}
						onFocus={this.onTagsFocus}
						onBlur={this.onTagsBlur} />
					<button className="ProgressWindow-button" onClick={this.handleDone}>{this.text.done}</button>
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
		this.handleAlerts(items);
		
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
			let clientName = ZOTERO_CONFIG.CLIENT_NAME;
			let url = ZOTERO_CONFIG.CLIENT_DOWNLOAD_URL;
			let pageName = Zotero.getString('progressWindow_error_upgradeClient_latestVersion');
			let pageLink = `<a href="${url}">${pageName}</a>`;
			let html = {
				__html: Zotero.getString("progressWindow_error_upgradeClient", [clientName, pageLink])
			};
			contents = <span dangerouslySetInnerHTML={html}/>;
		}
		else if (err === "siteAccessLimits") {
			const translator = `<b>${args[0]}</b>`;
			const siteAccessURL = "https://www.zotero.org/support/kb/site_access_limits";
			const siteAccessTitle = Zotero.getString('progressWindow_error_siteAccessLimits');
			let siteAccessLink = `<a href="${siteAccessURL}" title="${siteAccessTitle}">${siteAccessTitle}</a>`;
			let html = {
				__html: Zotero.getString("progressWindow_error_siteAccessLimitsError", [translator, siteAccessLink])
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
			<div className="ProgressWindow-error" key={index} role="alert">
				{contents}
			</div>
		);
	}
	
	render() {
		return (
			<div ref={(el) => {this.rootNode = el}}
					className="ProgressWindow-box"
					onMouseEnter={this.handleMouseEnter}
					onMouseLeave={this.handleMouseLeave}
					onClick={this.handleUserInteraction}
					onKeyDown={this.handleKeyDown}
					onKeyPress={this.handleKeyPress}>
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
	static propTypes = {
		rows: PropTypes.object.isRequired,
		focused: PropTypes.object,
		onExpandRows: PropTypes.func.isRequired,
		onCollapseRows: PropTypes.func.isRequired,
		onRowToggle: PropTypes.func.isRequired,
		onRowFocus: PropTypes.func.isRequired,
		onKeyPress: PropTypes.func
	};
	
	constructor(props) {
		super(props);
	}
	
	static getDerivedStateFromProps(nextProps) {
		return {
			expanded: new Set(nextProps.rows.filter(row => row.expanded).map(t => t.id))
		};
	}
	
	getRoots() {
		return this.props.rows.filter(row => !row.level);
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
		return this.state.expanded.has(id);
	}
	
	handleRowFocus(item) {
		if (!item) {
			return;
		}
		this.props.onRowFocus(item.id);
	}
	
	handleKeyPress(event) {
		if (!event.altKey && !event.ctrlKey && !event.metaKey) {
			// Collapse/expand current library on "-" or "+"
			if (event.key == '-') {
				this.collapseCurrentLibrary();
			}
			else if (event.key == '+') {
				this.expandCurrentLibrary();
			}
			else {
				// TODO: Find-as-you-type navigation
			}
		}
		
		if (this.props.onKeyPress) {
			this.props.onKeyPress(event);
		}
	}
	
	collapseCurrentLibrary() {
		var focused = this.props.focused;
		var pos = this.props.rows.findIndex(row => row.id == focused.id);
		var collapse = [];
		// First find the last row in the library
		while (pos + 1 < this.props.rows.length) {
			pos++;
			let current = this.props.rows[pos].id;
			// If we hit another library, go back one
			if (getTargetType(current) == 'library') {
				pos--;
				break;
			}
		}
		
		while (true) {
			if (pos == -1) break;
			let current = this.props.rows[pos];
			collapse.push(current.id);
			// When we reach a library, select it and stop
			if (getTargetType(current.id) == 'library') {
				this.props.onRowFocus(current.id);
				break;
			}
			pos--;
		}
		this.props.onCollapseRows(collapse);
	}
	
	
	expandCurrentLibrary() {
		var focused = this.props.focused;
		var pos = this.props.rows.findIndex(row => row.id == focused.id);
		var expand = [];
		// First find the library row
		while (pos >= 0) {
			let current = this.props.rows[pos].id;
			if (getTargetType(current) == 'library') {
				break;
			}
			pos--;
		}
		var libraryID = this.props.rows[pos].id;
		
		while (true) {
			if (pos == this.props.rows.length) break;
			let current = this.props.rows[pos];
			// When we reach another library, select it and stop
			if (getTargetType(current.id) == 'library' && current.id != libraryID) {
				break;
			}
			// If the next row exists, isn't a library, and is one level higher, expand this row
			let next = this.props.rows[pos + 1];
			if (next && getTargetType(next.id) != 'library' && next.level > current.level) {
				expand.push(current.id);
			}
			pos++;
		}
		this.props.onExpandRows(expand);
	}
	
	
	render() {
		return React.createElement(
			Tree,
			{
				onKeyPress: event => this.handleKeyPress(event),
				
				itemHeight: 20, // px
				
				getRoots: () => this.getRoots(),
				getKey: item => item.id,
				getParent: item => getParent(this.props.rows, item.id),
				getChildren: item => this.getChildren(item.id),
				isExpanded: item => this.itemIsExpanded(item.id),
				
				renderItem: (item, depth, isFocused, arrow, isExpanded) => {
					let className = "";
					if (isFocused) {
						className += "focused";
					}
					if (!item.passesFilter && item.passingParent) {
						className += " context-row";
					}
					
					return (
						<div className={className} style={{marginLeft: depth * 5 + "px"}}>
							{/* Add toggle on arrow click, since we disabled it in tree.js for
							    clicking on the row itself. If the tree is updated to have less
							    annoying behavior, this can be reverted. */}
							<span onClick={() => this.props.onRowToggle(item.id)}>{arrow}</span>
							<TargetIcon type={getTargetType(item.id)} />
							<span className="tree-item-label">{item.name}</span>
						</div>
					);
				},
				
				focused: this.props.focused,
				
				onFocus: item => this.handleRowFocus(item),
				onExpand: item => this.props.onExpandRows([item.id]),
				onCollapse: item => this.props.onCollapseRows([item.id]),
				
				autoExpandAll: false,
				autoExpandDepth: 0,
				label: Zotero.getString("progressWindow_collectionSelector")
			}
		);
	}
}
