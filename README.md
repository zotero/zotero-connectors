# Zotero Connectors

## Building

1. `git clone --recursive https://github.com/zotero/zotero-connectors.git`
1. `cd zotero-connectors`
1. `./build.sh -D`

The connectors are built in `build/` by default. To use a different directory, copy `config.sh-sample` to `config.sh` and modify `BUILD_DIR`.

## Running from the build directory

### Chrome

1. Go to chrome://extensions/
1. Enable "Developer Mode".
1. Click "Load unpacked extension…" and select the `build/chrome` directory.

### Firefox

1. In a developer/unbranded build of Firefox, set `xpinstall.signatures.required` pref to `false`.
1. In the [Firefox profile directory](http://support.mozilla.com/kb/Profiles), create a `zotero@chnm.gmu.edu` text file within the `extensions` directory containing the full path to the `build/chrome` directory. (You may need to create the `extensions` directory.)
1. Restart Firefox and accept the installation if prompted.

## Automatic rebuilding/reloading

1. `brew install chrome-cli` (OS X only; Chrome extension reloading)
1. `npm install -g grunt-cli`
1. `cd` to project root
1. `npm install`
1. `grunt watch`

As files are changed, the connectors will be rebuilt automatically. On OS X, if `chrome-cli` is installed, the Chrome extension will be automatically reloaded.

## Requirements for packaging extensions from the command line

* Copy `config.sh-sample` to `config.sh` and modify as necessary
* Safari/Chrome extension certificates
* [Google Chrome](https://www.google.com/intl/en/chrome/browser/) or [Chromium](http://www.chromium.org/)
* xar with [patch for building Safari extensions](https://code.google.com/p/xar/issues/detail?id=76)

## Requirements for bookmarklet

* [UglifyJS](https://github.com/mishoo/UglifyJS/) (unless debug is passed at the command line)
