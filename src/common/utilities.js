
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

(function() {

"use strict";

Zotero.Utilities = Zotero.Utilities || {};

Zotero.Utilities.Connector = {
	throttleAsync: function(func, wait) {
		var previous = 0;
		return function() {
			let now = Date.now();
			let remaining = wait - (now - previous);
			if (remaining <= 0) {
				previous = now;
				return func.apply(this, arguments);
			}
			// Reserve time for next invocation
			previous = now + remaining;
			return new Promise(resolve => setTimeout(resolve, remaining)).then(() => func.apply(this, arguments));
		}
	},

	kbEventToShortcutString: function (e) {
		const keymap = [
			['ctrlKey', 'Ctrl+'],
			['shiftKey', 'Shift+'],
			['altKey', 'Alt+'],
			['metaKey', '⌘'],
		];
		let val= "";
		for (let [key, value] of keymap) {
			if (e[key]) {
				val += value;
			}
		}
		val += e.key.length == 1 ? e.key.toUpperCase() : '';
		return val;
	},
	
	createMV3PersistentObject: async function (name) {
		if (!Zotero.isManifestV3) return {};
		let stored = await browser.storage.session.get({[name]: "{}"});
		let obj = JSON.parse(stored[name]);
		function persist() {
			let json = JSON.stringify(obj, (key, value) => {
				if (typeof value === 'function') {
					Zotero.logError(new Error(`MV3PersistentObject '${name}': cannot serialize function at key '${key}'`));
					return undefined;
				}
				return value;
			});
			browser.storage.session.set({[name]: json});
		}
		function makeDeepProxy(target) {
			return new Proxy(target, {
				get: function(target, prop, receiver) {
					let value = Reflect.get(target, prop, receiver);
					if (value !== null && typeof value === 'object') {
						return makeDeepProxy(value);
					}
					return value;
				},
				set: function (target, prop, value) {
					target[prop] = value;
					persist();
					return true;
				},
				deleteProperty: function(target, prop) {
					delete target[prop];
					persist();
					return true;
				}
			});
		}
		return makeDeepProxy(obj);
	},
	
	keepServiceWorkerAliveFunction: function(fn) {
		return async function(...args) {
			try {
				Zotero.Connector_Browser.setKeepServiceWorkerAlive(true);
				let result = fn.apply(this, args);
				if (result.then) result = await result;
				return result;
			}
			finally {
				Zotero.Connector_Browser.setKeepServiceWorkerAlive(false);
			}
		}
	},
	
	getContentTypeFromXHR: function(xhr) {
		var contentType = "application/octet-stream",
			charset = null,
			contentTypeHeader = xhr.getResponseHeader("Content-Type");
		if (contentTypeHeader) {
			// See RFC 2616 sec 3.7
			var m = /^[^\x00-\x1F\x7F()<>@,;:\\"\/\[\]?={} ]+\/[^\x00-\x1F\x7F()<>@,;:\\"\/\[\]?={} ]+/.exec(contentTypeHeader);
			if(m) contentType = m[0].toLowerCase();
			m = /;\s*charset\s*=\s*("[^"]+"|[^\x00-\x1F\x7F()<>@,;:\\"\/\[\]?={} ]+)/.exec(contentTypeHeader);
			if (m) {
				charset = m[1];
				if(charset[0] === '"') charset = charset.substring(1, charset.length-1);
			}
		}
		return { contentType, charset };
	},

	getNodeSelector(node) {
		let selector = ``;
		while (node.ownerDocument) {
			if (node.classList.length) selector = Array.from(node.classList).map(cls => '.' + cls).join('') + selector
			if (node.id) selector = `#${node.id}` + selector;
			selector = ` ${node.nodeName.toLowerCase()}` + selector;
			node = node.parentNode;
		}
		return selector;
	},
	
	// Formatted version of a popular md5 implementation
	// Original copyright (c) Paul Johnston & Greg Holt.
	// https://stackoverflow.com/a/60467595 
	md5: function (inputString) {
		var hc="0123456789abcdef";
		function rh(n) {var j,s="";for(j=0;j<=3;j++) s+=hc.charAt((n>>(j*8+4))&0x0F)+hc.charAt((n>>(j*8))&0x0F);return s;}
		function ad(x,y) {var l=(x&0xFFFF)+(y&0xFFFF);var m=(x>>16)+(y>>16)+(l>>16);return (m<<16)|(l&0xFFFF);}
		function rl(n,c)            {return (n<<c)|(n>>>(32-c));}
		function cm(q,a,b,x,s,t)    {return ad(rl(ad(ad(a,q),ad(x,t)),s),b);}
		function ff(a,b,c,d,x,s,t)  {return cm((b&c)|((~b)&d),a,b,x,s,t);}
		function gg(a,b,c,d,x,s,t)  {return cm((b&d)|(c&(~d)),a,b,x,s,t);}
		function hh(a,b,c,d,x,s,t)  {return cm(b^c^d,a,b,x,s,t);}
		function ii(a,b,c,d,x,s,t)  {return cm(c^(b|(~d)),a,b,x,s,t);}
		function sb(x) {
			var i;var nblk=((x.length+8)>>6)+1;var blks=new Array(nblk*16);for(i=0;i<nblk*16;i++) blks[i]=0;
			for(i=0;i<x.length;i++) blks[i>>2]|=x.charCodeAt(i)<<((i%4)*8);
			blks[i>>2]|=0x80<<((i%4)*8);blks[nblk*16-2]=x.length*8;return blks;
		}
		var i,x=sb(""+inputString),a=1732584193,b=-271733879,c=-1732584194,d=271733878,olda,oldb,oldc,oldd;
		for(i=0;i<x.length;i+=16) {olda=a;oldb=b;oldc=c;oldd=d;
			a=ff(a,b,c,d,x[i+ 0], 7, -680876936);d=ff(d,a,b,c,x[i+ 1],12, -389564586);c=ff(c,d,a,b,x[i+ 2],17,  606105819);
			b=ff(b,c,d,a,x[i+ 3],22,-1044525330);a=ff(a,b,c,d,x[i+ 4], 7, -176418897);d=ff(d,a,b,c,x[i+ 5],12, 1200080426);
			c=ff(c,d,a,b,x[i+ 6],17,-1473231341);b=ff(b,c,d,a,x[i+ 7],22,  -45705983);a=ff(a,b,c,d,x[i+ 8], 7, 1770035416);
			d=ff(d,a,b,c,x[i+ 9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,     -42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
			a=ff(a,b,c,d,x[i+12], 7, 1804603682);d=ff(d,a,b,c,x[i+13],12,  -40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);
			b=ff(b,c,d,a,x[i+15],22, 1236535329);a=gg(a,b,c,d,x[i+ 1], 5, -165796510);d=gg(d,a,b,c,x[i+ 6], 9,-1069501632);
			c=gg(c,d,a,b,x[i+11],14,  643717713);b=gg(b,c,d,a,x[i+ 0],20, -373897302);a=gg(a,b,c,d,x[i+ 5], 5, -701558691);
			d=gg(d,a,b,c,x[i+10], 9,   38016083);c=gg(c,d,a,b,x[i+15],14, -660478335);b=gg(b,c,d,a,x[i+ 4],20, -405537848);
			a=gg(a,b,c,d,x[i+ 9], 5,  568446438);d=gg(d,a,b,c,x[i+14], 9,-1019803690);c=gg(c,d,a,b,x[i+ 3],14, -187363961);
			b=gg(b,c,d,a,x[i+ 8],20, 1163531501);a=gg(a,b,c,d,x[i+13], 5,-1444681467);d=gg(d,a,b,c,x[i+ 2], 9,  -51403784);
			c=gg(c,d,a,b,x[i+ 7],14, 1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);a=hh(a,b,c,d,x[i+ 5], 4,    -378558);
			d=hh(d,a,b,c,x[i+ 8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16, 1839030562);b=hh(b,c,d,a,x[i+14],23,  -35309556);
			a=hh(a,b,c,d,x[i+ 1], 4,-1530992060);d=hh(d,a,b,c,x[i+ 4],11, 1272893353);c=hh(c,d,a,b,x[i+ 7],16, -155497632);
			b=hh(b,c,d,a,x[i+10],23,-1094730640);a=hh(a,b,c,d,x[i+13], 4,  681279174);d=hh(d,a,b,c,x[i+ 0],11, -358537222);
			c=hh(c,d,a,b,x[i+ 3],16, -722521979);b=hh(b,c,d,a,x[i+ 6],23,   76029189);a=hh(a,b,c,d,x[i+ 9], 4, -640364487);
			d=hh(d,a,b,c,x[i+12],11, -421815835);c=hh(c,d,a,b,x[i+15],16,  530742520);b=hh(b,c,d,a,x[i+ 2],23, -995338651);
			a=ii(a,b,c,d,x[i+ 0], 6, -198630844);d=ii(d,a,b,c,x[i+ 7],10, 1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);
			b=ii(b,c,d,a,x[i+ 5],21,  -57434055);a=ii(a,b,c,d,x[i+12], 6, 1700485571);d=ii(d,a,b,c,x[i+ 3],10,-1894986606);
			c=ii(c,d,a,b,x[i+10],15,   -1051523);b=ii(b,c,d,a,x[i+ 1],21,-2054922799);a=ii(a,b,c,d,x[i+ 8], 6, 1873313359);
			d=ii(d,a,b,c,x[i+15],10,  -30611744);c=ii(c,d,a,b,x[i+ 6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21, 1309151649);
			a=ii(a,b,c,d,x[i+ 4], 6, -145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+ 2],15,  718787259);
			b=ii(b,c,d,a,x[i+ 9],21, -343485551);a=ad(a,olda);b=ad(b,oldb);c=ad(c,oldc);d=ad(d,oldd);
		}
		return rh(a)+rh(b)+rh(c)+rh(d);
	},
	
	/**
	 * Converts an ArrayBuffer to a base64 encoded string
	 * 
	 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert
	 * @return {string} - The base64 encoded string
	 */
	arrayBufferToBase64: function(buffer) {
		// Byte-wise Base64 encoder that doesn't rely on btoa, safe for arbitrary binary data
		const bytes = new Uint8Array(buffer);
		const base64abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		let result = "";
		let i = 0;
		const len = bytes.length;
		for (; i + 2 < len; i += 3) {
			let n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
			result += base64abc[(n >> 18) & 63]
				+ base64abc[(n >> 12) & 63]
				+ base64abc[(n >> 6) & 63]
				+ base64abc[n & 63];
		}
		if (i < len) {
			let n = bytes[i] << 16;
			result += base64abc[(n >> 18) & 63];
			if (i === len - 1) {
				result += base64abc[(n >> 12) & 63] + "==";
			} else {
				n |= bytes[i + 1] << 8;
				result += base64abc[(n >> 12) & 63]
					+ base64abc[(n >> 6) & 63]
					+ "=";
			}
		}
		return result;
	},
	
	/**
	 * Converts a base64 encoded string back to an ArrayBuffer
	 * 
	 * @param {string} base64 - The base64 encoded string to convert
	 * @return {ArrayBuffer} - The ArrayBuffer
	 */
	base64ToArrayBuffer: function(base64) {
		// Convert base64 to binary string
		const binaryString = atob(base64);
		const len = binaryString.length;
		
		// Create a Uint8Array from the binary string
		const uint8Array = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			uint8Array[i] = binaryString.charCodeAt(i);
		}
		
		return uint8Array.buffer;
	},

	/**
	 * Try to guess the mime type of an attachment based on its URL.
	 * Used as a fallback when the mime type is not provided by the translator.
	 */
	guessAttachmentMimeType: function (url) {
		if (!url) return undefined;

		let extension = url.split(".").pop().toLowerCase();
		switch (extension) {
			case "pdf":
				return "application/pdf";
			case "jpg":
			case "jpeg":
				return "image/jpeg";
			case "png":
				return "image/png";
			default:
				return undefined;
		}
	}
};

if (!Zotero.Utilities.Internal) {
	Zotero.Utilities.Internal = {};
}
Zotero.Utilities.Internal.filterStack = function (stack) {
	return stack;
}

})();