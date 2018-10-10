/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
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

const ZOTERO_CONFIG = {
	CLIENT_NAME: 'Zotero',
	DOMAIN_NAME: 'zotero.org',
	REPOSITORY_URL: 'https://repo.zotero.org/repo/',
	REPOSITORY_CHECK_INTERVAL: 86400, // 24 hours
	REPOSITORY_RETRY_INTERVAL: 3600, // 1 hour
	REPOSITORY_CHANNEL: 'trunk',
	BASE_URI: 'https://zotero.org/',
	WWW_BASE_URL: 'https://www.zotero.org/',
	CLIENT_DOWNLOAD_URL: 'https://www.zotero.org/download',
	API_URL: 'https://api.zotero.org/',
	GOOGLE_DOCS_API_URL: "https://script.googleapis.com/v1/scripts/1yB-M2ynZPu5fDKJW96sCvNTenn9VRRgJi1e-b_Kq6TJjMs_F2rdxXK30:run",
	OAUTH: {
		ZOTERO: {
			REQUEST_URL: 'https://www.zotero.org/oauth/request',
			ACCESS_URL: 'https://www.zotero.org/oauth/access',
			AUTHORIZE_URL: 'https://www.zotero.org/oauth/authorize',
			CALLBACK_URL: 'https://www.zotero.org/connector_auth_complete',
			CLIENT_KEY: '05a4e25d3d9af8922eb9',
			CLIENT_SECRET: '8dda1d6aa188bdd3126e'
		},
		GOOGLE_DOCS: {
			AUTHORIZE_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
			ACCESS_URL: 'https://www.googleapis.com/oauth2/v3/tokeninfo',
			CALLBACK_URL: 'https://www.zotero.org/connector_auth_complete',
			CLIENT_KEY: '222339878061-13uqre19u268oo9pdapuaifklbu8d6js.apps.googleusercontent.com',
		}
	},
	GOOGLE_DOCS_DEV_MODE: false
};