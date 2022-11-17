/*
	MIT License

    Copyright (c) 2019 LvChengbin <myqmlu@gmail.com>

    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
	
	https://github.com/LvChengbin/url
 */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = global || self, factory(global));
}(this, (function (exports) { 'use strict';

    var isString = str => typeof str === 'string' || str instanceof String;

    var isNumber = ( n, strict = false ) => {
        if( ({}).toString.call( n ).toLowerCase() === '[object number]' ) {
            return true;
        }
        if( strict ) return false;
        return !isNaN( parseFloat( n ) ) && isFinite( n )  && !/\.$/.test( n );
    };

    var isInteger = ( n, strict = false ) => {

        if( isNumber( n, true ) ) return n % 1 === 0;

        if( strict ) return false;

        if( isString( n ) ) {
            if( n === '-0' ) return true;
            return n.indexOf( '.' ) < 0 && String( parseInt( n ) ) === n;
        }

        return false;
    };

    /**
     * BNF of IPv4 address
     *
     * IPv4address = dec-octet "." dec-octet "." dec-octet "." dec-octet
     *
     * dec-octet = DIGIT                ; 0-9
     *           / %x31-39 DIGIT        ; 10-99
     *           / "1" 2DIGIT           ; 100-199
     *           / "2" 2DIGIT           ; 200-249
     *           / "25" %x30-35         ; 250-255
     */
    var isIPv4 = ip => {
        if( !isString( ip ) ) return false;
        const pieces = ip.split( '.' );
        if( pieces.length !== 4 ) return false;

        for( const i of pieces ) {
            if( !isInteger( i ) ) return false;
            if( i < 0 || i > 255 ) return false;
        }
        return true;
    };

    /**
     * BNF of IPv6:
     *
     * IPv6address =                             6( h16 ":" ) ls32
     *              /                       "::" 5( h16 ":" ) ls32
     *              / [               h16 ] "::" 4( h16 ":" ) ls32
     *              / [ *1( h16 ":" ) h16 ] "::" 3( h16 ":" ) ls32
     *              / [ *2( h16 ":" ) h16 ] "::" 2( h16 ":" ) ls32
     *              / [ *3( h16 ":" ) h16 ] "::"    h16 ":"   ls32
     *              / [ *4( h16 ":" ) h16 ] "::"              ls32
     *              / [ *5( h16 ":" ) h16 ] "::"              h16
     *              / [ *6( h16 ":" ) h16 ] "::"
     *
     *  ls32 = ( h16 ":" h16 ) / IPv4address
     *       ; least-significant 32 bits of address
     *
     *  h16 = 1 * 4HEXDIG
     *      ; 16 bits of address represented in hexadcimal
     */

    var isIPv6 = ip => {
        /**
         * An IPv6 address should have at least one colon(:)
         */
        if( ip.indexOf( ':' ) < 0 ) return false;

        /**
         * An IPv6 address can start or end with '::', but cannot start or end with a single colon.
         */
        if( /(^:[^:])|([^:]:$)/.test( ip ) ) return false;

        /**
         * An IPv6 address should consist of colon(:), dot(.) and hexadecimel
         */
        if( !/^[0-9A-Fa-f:.]{2,}$/.test( ip ) ) return false;

        /**
         * An IPv6 address should not include any sequences bellow:
         * 1. a hexadecimal with length greater than 4
         * 2. three or more consecutive colons
         * 3. two or more consecutive dots
         */
        if( /[0-9A-Fa-f]{5,}|:{3,}|\.{2,}/.test( ip ) ) return false;

        /**
         * In an IPv6 address, the "::" can only appear once.
         */
        if( ip.split( '::' ).length > 2 ) return false;

        /**
         * if the IPv6 address is in mixed form.
         */
        if( ip.indexOf( '.' ) > -1 ) {
            const lastColon = ip.lastIndexOf( ':' );
            const hexadecimal = ip.substr( 0, lastColon );
            const decimal = ip.substr( lastColon + 1 );
            /**
             * the decimal part should be an valid IPv4 address.
             */
            if( !isIPv4( decimal ) ) return false;

            /**
             * the length of the hexadecimal part should less than 6.
             */
            if( hexadecimal.split( ':' ).length > 6 ) return false;
        } else {
            /**
             * An IPv6 address that is not in mixed form can at most have 8 hexadecimal sequences.
             */
            if( ip.split( ':' ).length > 8 ) return false;
        }
        return true;
    };

    function encodeSearch( search ) {
        if( !search ) return search;
        return '?' + search.substr( 1 ).replace( /[^&=]/g, m => encodeURIComponent( m ) );
    }

    /**
     * <user>:<password> can only be supported with FTP scheme on IE9/10/11
     *
     * URI = scheme ":" hier-part [ "?" query ] [ "#" fragment ]
     * reserved = gen-delims / sub-delims
     * gen-delims = ":" / "/" / "?" / "#" / "[" / "]" / "@"
     * sub-delims = "!" / "$" / "&" / "'" / "(" / ")"
     *              / "*" / "+" / "," / ";" / "="
     *
     * pct-encoded = "%" HEXDIG HEXDIG
     */

    /**
     * protocols that always contain a // bit and must have non-empty path
     */
    const slashedProtocol = {
        'http:' : true,
        'https:' : true,
        'ftp:' : true,
        'gopher:' : true,
        'file:' : true
    };

    function parse( url ) {
        if( !isString( url ) ) return false;
        /**
         * scheme = ALPHA * ( ALPHA / DIGIT / "+" / "-" / "." )
         */
        const splitted = url.match( /^([a-zA-Z][a-zA-Z0-9+-.]*:)([^?#]*)(\?[^#]*)?(#.*)?/ );
        if( !splitted ) return false;
        let [ , scheme, hier, search = '', hash = '' ] = splitted;
        const protocol = scheme.toLowerCase();
        let username = '';
        let password = '';
        let origin = protocol;
        let port = '';
        let pathname = '/';
        let hostname = '';

        if( slashedProtocol[ protocol ] ) {
            if( /^[:/?#[]@]*$/.test( hier ) ) return false;
            hier = '//' + hier.replace( /^\/+/, '' );
            origin += '//';
        }

        /**
         * hier-part = "//" authority path-abempty
         *              / path-absolute
         *              / path-rootless
         *              / path-empty
         * authority = [ userinfo "@" ] host [ ":" port ]
         * userinfo = *( unreserved / pct-encoded /sub-delims / ":" )
         *
         * path = path-abempty      ; begins with "/" or is empty
         *      / path-absolute     ; begins with "/" but not "//"
         *      / path-noscheme     ; begins with a non-colon segment
         *      / path-rootless     ; begins with a segment
         *      / path-empty        ; zero characters
         *
         * path-abempty     = *( "/" segment )
         * path-absolute    = "/" [ segment-nz *( "/" segment ) ]
         * path-noscheme    = segment-nz-nc *( "/" segment )
         * path-rootless    = segment-nz *( "/" segment )
         * path-empty       = 0<pchar>
         * segment          = *pchar
         * segment-nz       = 1*pchar
         * setment-nz-nc    = 1*( unreserved / pct-encoded /sub-delims / "@" )
         *                  ; non-zero-length segment without any colon ":"
         *
         * pchar            = unreserved / pct-encoded /sub-delims / ":" / "@"
         *
         * host = IP-literal / IPv4address / reg-name
         * IP-leteral = "[" ( IPv6address / IpvFuture ) "]"
         * IPvFuture = "v" 1*HEXDIG "." 1*( unreserved / sub-delims / ":" )
         * reg-name = *( unreserved / pct-encoded / sub-delims )
         *
         * PORT = *DIGIT
         * A TCP header is limited to 16-bits for the source/destination port field.
         * @see http://www.faqs.org/rfcs/rfc793.html
         */

        /**
         * "//" authority path-abempty
         */
        if( slashedProtocol[ protocol ] ) {
            const matches = hier.substr( 2 ).match( /(?:(?:(?:([^:/?#[\]@]*):([^:/?#[\]@]*))?@)|^)([^:/?#[\]@]+|\[[^/?#[\]@]+\])(?::([0-9]+))?(\/.*|\/)?$/ );
            if( !matches ) return false;

            [ , username = '', password = '', hostname = '', port = '', pathname = '/' ] = matches;
            if( port && port > 65535 ) return false;

            /**
             * To check the format of IPv4
             * includes: 1.1.1.1, 1.1, 1.1.
             * excludes: .1.1, 1.1..
             */
            if( /^[\d.]+$/.test( hostname ) && hostname.charAt( 0 ) !== '.' && hostname.indexOf( '..' ) < 0 ) {
                let ip = hostname.replace( /\.+$/, '' );
                if( !isIPv4( ip ) ) {
                    const pieces = ip.split( '.' );
                    if( pieces.length > 4 ) return false;
                    /**
                     * 300 => 0.0.1.44
                     * 2 => 0.0.0.2
                     */
                    if( pieces.length === 1 ) {
                        const n = pieces[ 0 ];
                        ip = [ ( n >> 24 ) & 0xff, ( n >> 16 ) & 0xff, ( n >> 8 ) & 0xff, n & 0xff ].join( '.' );
                    } else {
                        const l = pieces.length;
                        if( l < 4 ) {
                            pieces.splice( l - 1, 0, ...( Array( 3 - l ).join( 0 ).split( '' ) ) );
                        }
                        ip = pieces.join( '.' );
                    }
                    if( !isIPv4( ip ) ) return false;
                }
                hostname = ip;
            } else if( hostname.charAt( 0 ) === '[' ) {
                if( !isIPv6( hostname.substr( 1, hostname.length - 2 ) ) ) return false;
            }

            origin += hostname;
            if( port ) {
                origin += ':' + port;
            }
        } else {
            pathname = hier;
            origin = null;
        }

        search = encodeSearch( search );

        if( pathname && pathname.charAt( 0 ) !== '/' ) {
            pathname = '/' + pathname;
        }

        return {
            protocol,
            username,
            password,
            hostname,
            pathname,
            origin,
            search,
            hash,
            port
        };
    }

    parse.composite = function( pieces ) {
        const {
            protocol = '',
            username = '',
            password = '',
            hostname = '',
            port = '',
            pathname = '',
            search = '',
            hash = ''
        } = pieces;

        let href = protocol;

        if( slashedProtocol[ protocol ] ) {
            href += '//';
        }

        if( username || password ) {
            href += `${username}:${password}@`;
        }

        href += hostname;
        port && ( href += `:${port}` );

        href += `${pathname}${search}`;
        href += hash;
        return href;
    };

    const resolvePath = ( from, to ) => {
        const dot = /\/\.\//g;
        const dotdot = /\/[^/]+\/\.\.|[^/]+\/\.\.\//;
        let path = from.replace( /[^/]+$/, '' ) + to.replace( /^\//, '' );

        path = path.replace( dot, '/' );
        while( path.match( dotdot ) ) {
            path = path.replace( dotdot, '' );
        }

        path = path.replace( /^[./]+/, '' );

        if( path.charAt( 0 ) === '/' ) return path;
        return '/' + path;
    };

    function hier( url ) {
        return parse.composite( {
            protocol : url.protocol,
            hostname : url.hostname,
            password : url.password,
            username : url.username,
            port : url.port
        } ) 
    }

    var resolve = ( from, to ) => {
        const original = from;
        /**
         * the "from" must be a valid full URL string.
         */
        from = parse( from );
        if( !from ) {
            throw new TypeError( 'The first paramter must be a valid URL string.' );
        }

        if( !to ) return original;

        /**
         * if "to" is a valid full URL string, return "to".
         */
        if( parse( to ) ) return to;

        if( to.substr( 0, 2 ) === '//' ) {
            return from.protocol + to;
        }

        // absolute path
        if( to.charAt( 0 ) === '/' ) {
            return hier( from ) + to;
        }

        if( /^\.+\//.test( to ) ) {
            return hier( from ) + resolvePath( from.pathname, to );
        }

        if( to.charAt( 0 ) === '#' ) {
            return parse.composite( from ).replace( /#.*$/i, '' ) + to;
        }

        if( to.charAt( 0 ) === '?' ) {
            return hier( from ) + from.pathname + to;
        }

        return hier( from ) + resolvePath( from.pathname, '/' + to );
    };

    const decode = str => decodeURIComponent( String( str ).replace( /\+/g, ' ' ) );

    class URLSearchParams {
        constructor( init ) {
            this.dict = [];

            if( !init ) return;

            if( URLSearchParams.prototype.isPrototypeOf( init ) ) {
                return new URLSearchParams( init.toString() );
            }

            if( Array.isArray( init ) ) {
                throw new TypeError( 'Failed to construct "URLSearchParams": The provided value cannot be converted to a sequence.' );
            }

            if( typeof init === 'string' ) {
                if( init.charAt(0) === '?' ) {
                    init = init.slice( 1 );
                }
                const pairs = init.split( /&+/ );
                for( const item of pairs ) {
                    const index = item.indexOf( '=' );
                    this.append(
                        index > -1 ? item.slice( 0, index ) : item,
                        index > -1 ? item.slice( index + 1 ) : ''
                    );
                }
                return;
            }

            for( let attr in init ) {
                this.append( attr, init[ attr ] );
            }
        }
        append( name, value ) {
            this.dict.push( [ decode( name ), decode( value ) ] );
        }
        delete( name ) {
            const dict = this.dict;
            for( let i = 0, l = dict.length; i < l; i += 1 ) {
                if( dict[ i ][ 0 ] == name ) {
                    dict.splice( i, 1 );
                    i--; l--;
                }
            }
        }
        get( name ) {
            for( const item of this.dict ) {
                if( item[ 0 ] == name ) {
                    return item[ 1 ];
                }
            }
            return null;
        }
        getAll( name ) {
            const res = [];
            for( const item of this.dict ) {
                if( item[ 0 ] == name ) {
                    res.push( item[ 1 ] );
                }
            }
            return res;
        }
        has( name ) {
            for( const item of this.dict ) {
                if( item[ 0 ] == name ) {
                    return true;
                }
            }
            return false;
        }
        set( name, value ) {
            let set = false;
            for( let i = 0, l = this.dict.length; i < l; i += 1 ) {
                const item  = this.dict[ i ];
                if( item[ 0 ] == name ) {
                    if( set ) {
                        this.dict.splice( i, 1 );
                        i--; l--;
                    } else {
                        item[ 1 ] = String( value );
                        set = true;
                    }
                }
            }
            if( !set ) {
                this.dict.push( [ name, String( value ) ] );
            }
        }

        /**
         * Array.prototype.sort is not stable.
         * http://ecma-international.org/ecma-262/6.0/#sec-array.prototype.sort
         *
         * the URLSearchParams.sort should be a stable sorting algorithm method.
         * 
         * To use inseration sort while the length of the array little than 100, otherwise, using the merge sort instead.
         * It was identified by nodejs and v8;
         * https://github.com/nodejs/node/blob/master/lib/internal/url.js
         * https://github.com/v8/v8/blob/master/src/js/array.js
         */
        sort() {
            const a = this.dict;
            const n = a.length;

            if( n < 2 ) ; else if( n < 100 ) {
                // insertion sort
                for( let i = 1; i < n; i += 1 ) {
                    const item = a[ i ];
                    let j = i - 1;
                    while( j >= 0 && item[ 0 ] < a[ j ][ 0 ] ) {
                        a[ j + 1 ] = a[ j ];
                        j -= 1;
                    }
                    a[ j + 1 ] = item;
                }
            } else {
                /**
                 * Bottom-up iterative merge sort
                 */
                for( let c = 1; c <= n - 1; c = 2 * c ) {
                    for( let l = 0; l < n - 1; l += 2 * c ) {
                        const m = l + c - 1;
                        const r = Math.min( l + 2 * c - 1, n - 1 );
                        if( m > r ) continue;
                        merge( a, l, m, r );
                    }
                }
            }
        }

        entries() {

            const dict = [];

            for( let item of this.dict ) {
                dict.push( [ item[ 0 ], item[ 1 ] ] );
            }
            
            return dict;
        }

        keys() {
            const keys = [];
            for( let item of this.dict ) {
               keys.push( item[ 0 ] );
            }

            return keys;
        }

        values() {
            const values = [];
            for( let item of this.dict ) {
               values.push( item[ 1 ] );
            }

            return values;
        }

        toString() {
            const pairs = [];
            for( const item of this.dict ) {
                pairs.push( encodeURIComponent( item[ 0 ] ) + '=' + encodeURIComponent( item[ 1 ] ) );
            }
            return pairs.join( '&' );
        }
    }

    // function for merge sort
    function merge( a, l, m, r ) {
        const n1 = m - l + 1;
        const n2 = r - m;
        const L = a.slice( l, m + 1 );
        const R = a.slice( m + 1, 1 + r );

        let i = 0, j = 0, k = l;
        while( i < n1 && j < n2 ) {
            if( L[ i ][ 0 ] <= R[ j ][ 0 ] ) {
                a[ k ] = L[ i ];
                i++;
            } else {
                a[ k ] = R[ j ];
                j++;
            }
            k++;
        }

        while( i < n1 ) {
            a[ k ] = L[ i ];
            i++;
            k++;
        }

        while( j < n2 ) {
            a[ k ] = R[ j ];
            j++;
            k++;
        }
    }

    const validBaseProtocols = {
        'http:' : true,
        'https:' : true,
        'file:' : true,
        'ftp:' : true,
        'gopher' : true
    };

    class URL {
        constructor( url, base ) {
            if( URL.prototype.isPrototypeOf( url ) ) {
                return new URL( url.href );
            }

            if( URL.prototype.isPrototypeOf( base ) ) {
                return new URL( url, base.href );
            }

            url = String( url );

            if( base !== undefined ) {
                const parsed = parse( base );
                if( !parsed || !validBaseProtocols[ parsed.protocol ] ) {
                    throw new TypeError( 'Failed to construct "URL": Invalid base URL' );
                }
                if( parse( url ) ) base = null;
            } else {
                if( !parse( url ) ) {
                    throw new TypeError( 'Failed to construct "URL": Invalid URL' );
                }
            }
            if( base ) url = resolve( base, url );
            Object.assign( this, parse( url ) );
        }

        get href() {
            return parse.composite( {
                protocol : this.protocol,
                username : this.username,
                password : this.password,
                hostname : this.hostname,
                pathname : this.pathname,
                search : this.search,
                hash : this.hash,
                port : this.port
            } );
        }

        get host() {
            return this.port ? `${this.hostname}:${this.port}` : this.hostname;
        }

        set host( value ) {
            const [ hostname = '', port = '' ] = String( value ).split( ':' );
            this.hostname = hostname;
            this.port = port;
        }

        get search() {
            const search = this.searchParams.toString();
            return search ? `?${search}` : '';
        }

        set search( value ) {
            this.searchParams = new URLSearchParams( value.replace( /^[?&]+/, '' ) );
        }

        toString() {
            return this.href;
        }
        toJSON() {
            return this.href;
        }
    }

    exports.URL = URL;
    exports.URLSearchParams = URLSearchParams;
    exports.parse = parse;
    exports.resolve = resolve;

    Object.defineProperty(exports, '__esModule', { value: true });

})));