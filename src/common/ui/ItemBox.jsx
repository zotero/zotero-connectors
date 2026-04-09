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

class ItemBoxField extends React.PureComponent {
	constructor(props) {
		super(props);
		this.handleChange = this.handleChange.bind(this);
		this.textareaRef = React.createRef();
	}

	componentDidMount() {
		this.autoSizeTextarea();
	}

	componentDidUpdate(prevProps) {
		if (prevProps.value !== this.props.value) {
			this.autoSizeTextarea();
		}
	}

	autoSizeTextarea() {
		var textarea = this.textareaRef.current;
		if (!textarea) return;
		// Reset to single row to get accurate scrollHeight
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';
	}

	handleChange(event) {
		this.props.onChange(this.props.fieldName, event.target.value);
	}

	render() {
		var { label, value, readOnly, fieldName, multiline } = this.props;
		var inputElement;
		if (multiline) {
			inputElement = <textarea
				ref={this.textareaRef}
				className="ItemBox-input ItemBox-textarea"
				aria-label={label}
				value={value || ""}
				rows={1}
				readOnly={readOnly}
				onChange={readOnly ? undefined : this.handleChange}
				onFocus={this.props.onFocus}
				onBlur={this.props.onBlur}
				onKeyPress={this.props.onKeyDown}
			/>;
		}
		else {
			inputElement = <input
				type="text"
				className="ItemBox-input"
				aria-label={label}
				value={value || ""}
				readOnly={readOnly}
				onChange={readOnly ? undefined : this.handleChange}
				onFocus={this.props.onFocus}
				onBlur={this.props.onBlur}
				onKeyDown={this.props.onKeyDown}
			/>;
		}
		return (
			<li className={"ItemBox-row" + (multiline ? " ItemBox-row--multiline" : "")} data-field={fieldName}>
				<div className="ItemBox-label">
					<label>{label}</label>
				</div>
				<div className="ItemBox-value">
					{inputElement}
				</div>
			</li>
		);
	}
}

ItemBoxField.propTypes = {
	label: PropTypes.string.isRequired,
	value: PropTypes.string,
	fieldName: PropTypes.string.isRequired,
	readOnly: PropTypes.bool,
	multiline: PropTypes.bool,
	onChange: PropTypes.func.isRequired,
	onFocus: PropTypes.func,
	onBlur: PropTypes.func,
	onKeyDown: PropTypes.func
};


class CreatorTypeSelector extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = { open: false, focusedIndex: -1 };
		this.handleToggle = this.handleToggle.bind(this);
		this.handleSelect = this.handleSelect.bind(this);
		this.handleKeyDown = this.handleKeyDown.bind(this);
		this.handleClickOutside = this.handleClickOutside.bind(this);
		this.ref = React.createRef();
	}

	componentWillUnmount() {
		document.removeEventListener('mousedown', this.handleClickOutside);
	}

	open() {
		var currentIndex = this.props.options.findIndex(o => o.value === this.props.value);
		setTimeout(() => {
			document.addEventListener('mousedown', this.handleClickOutside);
		}, 0);
		this.setState({ open: true, focusedIndex: currentIndex >= 0 ? currentIndex : 0 });
	}

	close() {
		document.removeEventListener('mousedown', this.handleClickOutside);
		this.setState({ open: false, focusedIndex: -1 });
	}

	handleToggle() {
		if (this.props.disabled) return;
		if (this.state.open) {
			this.close();
		}
		else {
			this.open();
		}
	}

	handleClickOutside(event) {
		if (this.ref.current && !this.ref.current.contains(event.target)) {
			this.close();
		}
	}

	handleSelect(value) {
		this.close();
		this.props.onChange(value);
	}

	_getItems() {
		var { options, onMoveUp, onMoveDown } = this.props;
		var items = options.map(opt => ({ type: 'option', ...opt }));
		if (onMoveUp || onMoveDown) {
			items.push({ type: 'separator' });
			if (onMoveUp) {
				items.push({ type: 'action', key: 'moveUp', label: Zotero.getString('progressWindow_itemBox_moveUp'), handler: onMoveUp });
			}
			if (onMoveDown) {
				items.push({ type: 'action', key: 'moveDown', label: Zotero.getString('progressWindow_itemBox_moveDown'), handler: onMoveDown });
			}
		}
		return items;
	}

	_nextFocusable(items, from, direction) {
		var i = from + direction;
		while (i >= 0 && i < items.length) {
			if (items[i].type !== 'separator') return i;
			i += direction;
		}
		return from;
	}

	handleKeyDown(event) {
		var { open, focusedIndex } = this.state;

		if (!open) {
			if (event.key === 'Enter' || event.key === ' '
					|| event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				event.stopPropagation();
				this.open();
			}
			return;
		}

		var items = this._getItems();
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				event.stopPropagation();
				this.setState({ focusedIndex: this._nextFocusable(items, focusedIndex, 1) });
				break;
			case 'ArrowUp':
				event.preventDefault();
				event.stopPropagation();
				this.setState({ focusedIndex: this._nextFocusable(items, focusedIndex, -1) });
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				event.stopPropagation();
				if (focusedIndex >= 0 && focusedIndex < items.length) {
					var item = items[focusedIndex];
					if (item.type === 'action') {
						this.close();
						item.handler();
					}
					else if (item.type === 'option') {
						this.handleSelect(item.value);
					}
				}
				break;
			case 'Escape':
				event.preventDefault();
				event.stopPropagation();
				this.close();
				break;
			case 'Tab':
				this.close();
				break;
		}
	}

	render() {
		var { value, options, disabled } = this.props;
		var { open, focusedIndex } = this.state;
		var currentLabel = (options.find(o => o.value === value) || {}).label || '';
		var allItems = this._getItems();

		return (
			<div className="ItemBox-creatorTypeSelector" ref={this.ref}>
				<div
					className={"ItemBox-creatorTypeLabel" + (disabled ? " disabled" : "")}
					onClick={this.handleToggle}
					onKeyDown={disabled ? undefined : this.handleKeyDown}
					tabIndex={disabled ? -1 : 0}
					role="button"
					aria-haspopup="listbox"
					aria-expanded={open}
					aria-disabled={disabled}
				>
					{!disabled && <span className="ItemBox-creatorTypeChevron"/>}
					<span>{currentLabel}</span>
				</div>
				{open && (
					<ul className="ItemBox-creatorTypeMenu" role="listbox">
						{allItems.map((item, idx) => {
							if (item.type === 'separator') {
								return <li key="separator" className="ItemBox-creatorTypeMenuSeparator" role="separator"/>;
							}
							if (item.type === 'action') {
								return (
									<li
										key={item.key}
										className={"ItemBox-creatorTypeOption" + (idx === focusedIndex ? " focused" : "")}
										onClick={() => { this.close(); item.handler(); }}
										onMouseEnter={() => this.setState({ focusedIndex: idx })}
										role="option"
									>{item.label}</li>
								);
							}
							return (
								<li
									key={item.value}
									className={"ItemBox-creatorTypeOption"
										+ (item.value === value ? " selected" : "")
										+ (idx === focusedIndex ? " focused" : "")}
									onClick={() => this.handleSelect(item.value)}
									onMouseEnter={() => this.setState({ focusedIndex: idx })}
									role="option"
									aria-selected={item.value === value}
								>{item.label}</li>
							);
						})}
					</ul>
				)}
			</div>
		);
	}
}

CreatorTypeSelector.propTypes = {
	value: PropTypes.string.isRequired,
	options: PropTypes.array.isRequired,
	disabled: PropTypes.bool,
	onChange: PropTypes.func.isRequired,
	onMoveUp: PropTypes.func,
	onMoveDown: PropTypes.func
};


class CreatorRow extends React.PureComponent {
	constructor(props) {
		super(props);
		this.handleChange = this.handleChange.bind(this);
		this.handleSwitchMode = this.handleSwitchMode.bind(this);
		this.handleAdd = this.handleAdd.bind(this);
		this.handleRemove = this.handleRemove.bind(this);
		this.lastNameRef = React.createRef();
		this.firstNameRef = React.createRef();
	}

	componentDidMount() {
		this.sizeInputs();
	}

	componentDidUpdate() {
		this.sizeInputs();
	}

	_measureInput(input) {
		if (!input) return;
		if (!CreatorRow._measureSpan) {
			var span = document.createElement('span');
			span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
			document.body.appendChild(span);
			CreatorRow._measureSpan = span;
		}
		var span = CreatorRow._measureSpan;
		var style = getComputedStyle(input);
		span.style.font = style.font;
		span.textContent = input.value || input.placeholder;
		var textWidth = span.getBoundingClientRect().width;
		var maxWidth = textWidth
			+ parseFloat(style.paddingLeft)
			+ parseFloat(style.paddingRight)
			+ parseFloat(style.borderLeftWidth)
			+ parseFloat(style.borderRightWidth);
		input.style.maxWidth = Math.ceil(maxWidth) + 'px';
	}

	sizeInputs() {
		this._measureInput(this.lastNameRef.current);
		this._measureInput(this.firstNameRef.current);
	}

	handleChange(field, value) {
		this.props.onChange(this.props.index, field, value);
	}

	handleSwitchMode() {
		this.props.onSwitchMode(this.props.index);
	}

	handleAdd() {
		this.props.onAdd(this.props.index);
	}

	handleRemove() {
		this.props.onRemove(this.props.index);
	}

	render() {
		var { creator, creatorTypes, readOnly, onFocus, onBlur, onKeyDown } = this.props;
		var isDual = 'lastName' in creator;
		return (
			<li className="ItemBox-row ItemBox-creator">
				<div className="ItemBox-label">
					<CreatorTypeSelector
						value={creator.creatorType}
						options={creatorTypes}
						disabled={readOnly}
						onChange={(value) => this.handleChange('creatorType', value)}
						onMoveUp={this.props.isFirst ? null : () => this.props.onMoveUp(this.props.index)}
						onMoveDown={this.props.isLast ? null : () => this.props.onMoveDown(this.props.index)}
					/>
				</div>
				<div className="ItemBox-value">
					{isDual ? (
						<React.Fragment>
							<input
								ref={this.lastNameRef}
								type="text"
								className="ItemBox-input ItemBox-creatorInput"
								aria-label={Zotero.getString('progressWindow_itemBox_lastName')}
								placeholder={Zotero.getString('progressWindow_itemBox_lastName')}
								value={creator.lastName || ""}
								readOnly={readOnly}
								onChange={readOnly ? undefined : (e) => this.handleChange('lastName', e.target.value)}
								onFocus={onFocus}
								onBlur={onBlur}
								onKeyDown={onKeyDown}
							/>
							<input
								ref={this.firstNameRef}
								type="text"
								className="ItemBox-input ItemBox-creatorInput"
								aria-label={Zotero.getString('progressWindow_itemBox_firstName')}
								placeholder={Zotero.getString('progressWindow_itemBox_firstName')}
								value={creator.firstName || ""}
								readOnly={readOnly}
								onChange={readOnly ? undefined : (e) => this.handleChange('firstName', e.target.value)}
								onFocus={onFocus}
								onBlur={onBlur}
								onKeyDown={onKeyDown}
							/>
						</React.Fragment>
					) : (
						<input
							type="text"
							className="ItemBox-input"
							aria-label={Zotero.getString('progressWindow_itemBox_name')}
							placeholder={Zotero.getString('progressWindow_itemBox_name')}
							value={creator.name || ""}
							readOnly={readOnly}
							onChange={readOnly ? undefined : (e) => this.handleChange('name', e.target.value)}
							onFocus={onFocus}
							onBlur={onBlur}
							onKeyDown={onKeyDown}
						/>
					)}
					{!readOnly && (
						<React.Fragment>
							<button
								className={"ItemBox-creatorBtn ItemBox-creatorBtn--switch"
									+ (isDual ? " is-dual" : " is-single")}
								onClick={this.handleSwitchMode}
								title={isDual ? Zotero.getString('progressWindow_itemBox_switchToSingle') : Zotero.getString('progressWindow_itemBox_switchToDual')}
							/>
							<button
								className="ItemBox-creatorBtn ItemBox-creatorBtn--plus"
								onClick={this.props.addDisabled ? undefined : this.handleAdd}
								disabled={this.props.addDisabled}
								title={Zotero.getString('progressWindow_itemBox_addCreator')}
							/>
							<button
								className="ItemBox-creatorBtn ItemBox-creatorBtn--minus"
								onClick={this.handleRemove}
								title={Zotero.getString('progressWindow_itemBox_removeCreator')}
							/>
						</React.Fragment>
					)}
				</div>
			</li>
		);
	}
}

CreatorRow.propTypes = {
	index: PropTypes.number.isRequired,
	creator: PropTypes.object.isRequired,
	creatorTypes: PropTypes.array.isRequired,
	readOnly: PropTypes.bool,
	isFirst: PropTypes.bool,
	isLast: PropTypes.bool,
	addDisabled: PropTypes.bool,
	onSwitchMode: PropTypes.func.isRequired,
	onChange: PropTypes.func.isRequired,
	onAdd: PropTypes.func.isRequired,
	onRemove: PropTypes.func.isRequired,
	onMoveUp: PropTypes.func,
	onMoveDown: PropTypes.func,
	onFocus: PropTypes.func,
	onBlur: PropTypes.func,
	onKeyDown: PropTypes.func
};


Zotero.UI.ItemBox = class ItemBox extends React.PureComponent {
	constructor(props) {
		super(props);
		var defaultType = props.creatorTypes && props.creatorTypes.length
			? props.creatorTypes[0].value
			: 'author';
		this.state = {
			fields: props.fields ? props.fields.map(f => ({ ...f })) : [],
			creators: props.creators && props.creators.length
				? props.creators.map(c => ({ ...c }))
				: [{ creatorType: defaultType, firstName: '', lastName: '' }]
		};
		this.handleFieldChange = this.handleFieldChange.bind(this);
		this.handleCreatorChange = this.handleCreatorChange.bind(this);
		this.handleCreatorAdd = this.handleCreatorAdd.bind(this);
		this.handleCreatorRemove = this.handleCreatorRemove.bind(this);
		this.handleCreatorModeSwitch = this.handleCreatorModeSwitch.bind(this);
		this.handleCreatorMoveUp = this.handleCreatorMoveUp.bind(this);
		this.handleCreatorMoveDown = this.handleCreatorMoveDown.bind(this);
		this.handleFocus = this.handleFocus.bind(this);
		this.handleBlur = this.handleBlur.bind(this);
		this.handleKeyDown = this.handleKeyDown.bind(this);

		this._savedState = null;
	}

	fireOnChange(fields, creators) {
		if (this.props.onChange) {
			var nonEmpty = creators.filter(c =>
				'name' in c ? c.name : (c.firstName || c.lastName)
			);
			this.props.onChange({ fields, creators: nonEmpty });
		}
	}

	handleFieldChange(fieldName, value) {
		this.setState((prevState) => {
			var fields = prevState.fields.map(f =>
				f.name === fieldName ? { ...f, value } : f
			);
			return { fields };
		});
	}

	handleCreatorChange(index, field, value) {
		this.setState((prevState) => {
			var creators = prevState.creators.map((c, i) =>
				i === index ? { ...c, [field]: value } : c
			);
			return { creators };
		});
	}

	handleFocus() {
		if (!this._savedState) {
			this._savedState = {
				fields: this.state.fields.map(f => ({ ...f })),
				creators: this.state.creators.map(c => ({ ...c }))
			};
		}
		if (this.props.onInputFocus) {
			this.props.onInputFocus();
		}
	}

	handleBlur() {
		this._savedState = null;
		this.fireOnChange(this.state.fields, this.state.creators);
		if (this.props.onInputBlur) {
			this.props.onInputBlur();
		}
	}

	handleKeyDown(event) {
		if (event.key === 'Escape' && this._savedState) {
			this.setState({
				fields: this._savedState.fields,
				creators: this._savedState.creators
			});
			this._savedState = null;
			event.target.blur();
		}
		else if (event.key === 'Enter') {
			event.stopPropagation();
			if (event.target.tagName === 'TEXTAREA' && !event.shiftKey) {
				// Plain Enter in textarea: allow newline
			}
			else {
				// Shift+Enter in textarea, or Enter on any other input: commit
				event.preventDefault();
				event.target.blur();
			}
		}
	}

	handleCreatorAdd(index) {
		this.setState((prevState) => {
			var defaultType = this.props.creatorTypes && this.props.creatorTypes.length
				? this.props.creatorTypes[0].value
				: 'author';
			var creators = [
				...prevState.creators.slice(0, index + 1),
				{ creatorType: defaultType, firstName: '', lastName: '' },
				...prevState.creators.slice(index + 1)
			];
			this.fireOnChange(prevState.fields, creators);
			return { creators };
		});
	}

	handleCreatorModeSwitch(index) {
		this.setState((prevState) => {
			var creators = prevState.creators.map((c, i) => {
				if (i !== index) return c;
				if ('name' in c) {
					// Single → dual: split name into first/last
					var parts = (c.name || '').split(' ');
					var lastName = parts.length > 1 ? parts[parts.length - 1] : c.name || '';
					var firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
					return { creatorType: c.creatorType, firstName: firstName, lastName: lastName };
				}
				else {
					// Dual → single: merge first/last into name
					var name = ((c.firstName || '') + ' ' + (c.lastName || '')).trim();
					return { creatorType: c.creatorType, name: name };
				}
			});
			this.fireOnChange(prevState.fields, creators);
			return { creators };
		});
	}

	handleCreatorRemove(index) {
		this.setState((prevState) => {
			var creators;
			if (prevState.creators.length <= 1) {
				// Clear the last creator's names instead of removing the row
				var c = prevState.creators[0];
				if ('name' in c) {
					creators = [{ creatorType: c.creatorType, name: '' }];
				}
				else {
					creators = [{ creatorType: c.creatorType, firstName: '', lastName: '' }];
				}
			}
			else {
				creators = prevState.creators.filter((_, i) => i !== index);
			}
			this.fireOnChange(prevState.fields, creators);
			return { creators };
		});
	}

	handleCreatorMoveUp(index) {
		if (index <= 0) return;
		this.setState((prevState) => {
			var creators = [...prevState.creators];
			var temp = creators[index];
			creators[index] = creators[index - 1];
			creators[index - 1] = temp;
			this.fireOnChange(prevState.fields, creators);
			return { creators };
		});
	}

	handleCreatorMoveDown(index) {
		this.setState((prevState) => {
			if (index >= prevState.creators.length - 1) return null;
			var creators = [...prevState.creators];
			var temp = creators[index];
			creators[index] = creators[index + 1];
			creators[index + 1] = temp;
			this.fireOnChange(prevState.fields, creators);
			return { creators };
		});
	}

	render() {
		var { creatorTypes, readOnly } = this.props;
		var { fields, creators } = this.state;

		var itemTypeField = fields.find(f => f.name === 'itemType');
		var otherFields = fields.filter(f => f.name !== 'itemType');
		var hasEmptyCreator = creators.some(c =>
			'name' in c ? !c.name : (!c.firstName && !c.lastName)
		);

		return (
			<div className="ItemBox">
				<ol className="ItemBox-list">			
					<ItemBoxField
						key="itemType"
						fieldName="itemType"
						label={itemTypeField.label}
						value={itemTypeField.value}
						readOnly={true}
					/>	
					{creators.map((creator, index) => {
						return <CreatorRow
							key={index}
							index={index}
							creator={creator}
							creatorTypes={creatorTypes || []}
							readOnly={readOnly}
							addDisabled={hasEmptyCreator}
							isFirst={index === 0}
							isLast={index === creators.length - 1}
							onChange={this.handleCreatorChange}
							onSwitchMode={this.handleCreatorModeSwitch}
							onMoveUp={this.handleCreatorMoveUp}
							onMoveDown={this.handleCreatorMoveDown}
							onAdd={this.handleCreatorAdd}
							onRemove={this.handleCreatorRemove}
							onFocus={this.handleFocus}
							onBlur={this.handleBlur}
							onKeyDown={this.handleKeyDown}
						/>;
					})}
					{otherFields.map(field => (
						<ItemBoxField
							key={field.name}
							fieldName={field.name}
							label={field.label}
							value={field.value}
							readOnly={readOnly}
							multiline={field.multiline}
							onChange={this.handleFieldChange}
							onFocus={this.handleFocus}
							onBlur={this.handleBlur}
							onKeyDown={this.handleKeyDown}
						/>
					))}
				</ol>
			</div>
		);
	}
};

Zotero.UI.ItemBox.propTypes = {
	fields: PropTypes.array.isRequired,
	creators: PropTypes.array,
	creatorTypes: PropTypes.array,
	readOnly: PropTypes.bool,
	onChange: PropTypes.func,
	onInputFocus: PropTypes.func,
	onInputBlur: PropTypes.func
};
