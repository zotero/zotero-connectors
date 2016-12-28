/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2016 Center for History and New Media
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
Zotero.ui = Zotero.ui || {};

/**
 * Displays a prompt which is overlaid over the screen.
 */
Zotero.ui.ModalPrompt = React.createClass({
	propTypes: {
		title: React.PropTypes.string,
		/**
		 * Show/hide checkbox
		 */
		checkbox: React.PropTypes.bool,
		checkboxChecked: React.PropTypes.bool,
		/**
		 * Whether unchecked checkbox should block pressing button1
		 */
		checkboxBlock: React.PropTypes.bool,
		/**
		 * Show/hide input box
		 */
		input: React.PropTypes.bool,
		/**
		 * Rightmost button. Empty string hides button.
		 * @default Ok
		 */
		button1Text: React.PropTypes.string,
		/**
		 * Second to the right button. Empty string hides button.
		 * @default Cancel
		 */
		button2Text: React.PropTypes.string,
		/**
		 * Leftmost button. Empty string hides button.
		 * @default ''
		 */
		button3Text: React.PropTypes.string,
		/**
		 * Triggered on <ESC> clicking outside of the prompt and on Cancel, unless overriden.
		 * 
		 * This is required because the component does not know how to remove itself from the DOM.
		 */
		onClose: React.PropTypes.func.isRequired,
		onButton1: React.PropTypes.func,
		/**
		 * Triggered on clicking button2. Defaults to onClose
		 * @default onClose
		 */
		onButton2: React.PropTypes.func,
		onButton3: React.PropTypes.func,
	},

	getInitialState: function() {
		return {
			checkboxChecked: this.props.checkboxChecked || false,
			checkboxBlocked: this.props.checkboxBlock && !this.props.checkboxChecked || false,
			onButton: this.props.onButton || this.props.onClose,
			inputText: this.props.inputText || "",
		}
	},
	
	getDefaultProps: function() {
		return {
			title: "Zotero Connector",
			checkbox: false,
			checkboxText: "",
			checkboxBlock: false,
			input: false,
			inputPlaceholder: "",
			button1Text: "OK",
			button2Text: "Cancel",
			button3Text: "",
		}
	},
	
	componentDidMount: function() {
		document.addEventListener('keyup', this.escListener);
		setTimeout(() => this.refs.button1.focus());
	},
	
	componentWillUnmount: function() {
		document.removeEventListener('keyup', this.escListener);
	},
	
	escListener: function(event) {
		if (event.key == "Escape") {
			this.props.onClose(this.state, event);
			event.preventDefault();
		}
	},
	
	onCheckboxChange: function() {
		this.setState({checkboxChecked: !this.state.checkboxChecked, 
			checkboxBlocked: this.props.checkboxBlock && this.state.checkboxChecked});
	},
	
	onInputChange: function(event) {
		this.setState({inputText: event.value});
	},
	
	render() {
		var checkbox, input, buttons = ["", "", ""];
		checkbox = input = "";
		
		if (this.props.checkbox) {
			checkbox = (<p className="checkbox">
				<label>
					<input type="checkbox" style={{verticalAlign: "middle"}} checked={this.state.checkboxChecked} onChange={this.onCheckboxChange}/>
					{this.props.checkboxText}
				</label>
			</p>);
		}
		
		if (this.props.input) {
			input = (<p className="input">
				<label>
					<input value={this.state.inputText} placeholder={this.state.inputPlaceholder} onChange={this.onInputChange}/>
				</label>
			</p>);
		}
		
		for (let i = 1; i <= 3; i++) {
			if (this.props[`button${i}Text`].length) {
				let onClick = (e) => {e.stopPropagation(); this.state.onButton(this.state, e)};
				buttons[i-1] = <input type="button" name={i} value={this.props[`button${i}Text`]} onClick={onClick}
					disabled={i==1 && this.state.checkboxBlocked}
					ref={`button${i}`}
					style={{
						marginRight: i > 1 ? "16px" : "0",
						minWidth: "100px",
						padding: "6px 10px",
						fontSize: "16px"
				}}/>
			}
		}
		
		let onClose = (e) => {
			e.stopPropagation();
			if (e.target.classList.contains('modal-overlay')) {
				this.props.onClose(this.state, e)	;
			}
		};
		
		let message = this.props.children || this.props.message;
		if (typeof message == "string") {
			message = <span dangerouslySetInnerHTML={{__html: message}}/>
		}
		return (<div className="modal-overlay" style={{
			position: "fixed", top: "0",
			width: "100%", height: "100%",
			backgroundColor: "rgba(0, 0, 0, 0.3)",
			zIndex: "1000000" // go big or go home
		}} onClick={onClose}>
			<div className="popup" style={{
				position: "fixed",
				top: "50%", left: "50%",
				transform: "translate(-50%, -50%)",
				backgroundColor: "#ededed",
				border: "#7a0000 2px solid",
				maxWidth: "50%", minWidth: "400px", 
				padding: "16px",
				fontSize: "16px", fontFamily: "Tahoma, Geneva, sans-serif"
			}}>
				<h2 className="popup-title">{this.props.title}</h2>
				<p className="popup-body">{message}</p>
				{checkbox}
				{input}
				<div className="popup-buttons" style={{
					display: "flex", flexDirection: "row",
					// this should be -16px (to counter padding), but firefox has awful bugs.
					// filed here: https://bugzilla.mozilla.org/show_bug.cgi?id=1072638
					margin: "0 -15px -15px -15px",
					padding: "16px",
					backgroundColor: "#e0e0e0"
				}}>
					{buttons[2]}
					<span style={{flexGrow: 1}}/>
					{buttons[1]}
					{buttons[0]}
				</div>
			</div>
		</div>)
	}
});
