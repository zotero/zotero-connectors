# Zotero Connectors

## Build Requirements

* Perl 5.12
* Copy `config.sh-sample` to `config.sh` and modify as necessary

### Requirements for packaging extensions from the command line

* Safari/Chrome extension certificates
* [Google Chrome](https://www.google.com/intl/en/chrome/browser/) or [Chromium](http://www.chromium.org/)
* xar with [patch for building Safari extensions](https://code.google.com/p/xar/issues/detail?id=76)

### Requirements for bookmarklet

* [UglifyJS](https://github.com/mishoo/UglifyJS/) (unless debug is passed at the command line)