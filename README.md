# Zotero Connectors

[![Build Status](https://travis-ci.org/zotero/zotero-connectors.svg?branch=master)](https://travis-ci.org/zotero/zotero-connectors)

## Building

1. `git clone --recursive https://github.com/zotero/zotero-connectors.git`
1. `cd zotero-connectors`
1. `npm install`
1. `./build.sh -d`

The connectors are built in `build/`.

## Running from the build directory

### Chrome

1. Go to chrome://extensions/
1. Enable "Developer Mode".
1. Click "Load unpacked extension…" and select the `build/browserExt` directory.

### Firefox

1. Go to about:debugging
1. Click "Load Temporary Add-on" and select the `build/browserExt/manifest.json` file.

OR

1. Get and install the [Mozilla web-ext tool](https://github.com/mozilla/web-ext)
1. `cd` to project root
1. `./scripts/firefox/run_xpi`

### Safari

See https://github.com/zotero/safari-app-extension 

## Automatic rebuilding/reloading

### Chrome on MacOS

1. `brew install chrome-cli`
1. `npm install -g gulp`
1. `cd` to project root
1. `npm install`
1. `build.sh -d`
1. `gulp watch-chrome`

As files are changed, the connectors will be rebuilt automatically and Chrome will reload the extension.

### Firefox

1. Get and install the [Mozilla web-ext tool](https://github.com/mozilla/web-ext)
1. `cd` to project root
1. `npm install`
1. `build.sh -d`
1. `gulp watch`
1. `./scripts/firefox/run_xpi` (in a different terminal window)

As files are changed, the connectors will be rebuilt automatically and Firefox will reload the extension.

### Others

1. `cd` to project root
1. `npm install`
1. `build.sh -d`
1. `gulp watch`

As files are changed, the connectors will be rebuilt automatically. You will need to manually reload the extension
in the browser being developed for.

## Requirements for packaging extensions from the command line

* Copy `config.sh-sample` to `config.sh` and modify as necessary
* Safari/Chrome extension certificates
* [Google Chrome](https://www.google.com/intl/en/chrome/browser/) or [Chromium](http://www.chromium.org/)
* xar with [patch for building Safari extensions](https://code.google.com/p/xar/issues/detail?id=76)

# Tests

To run tests locally, build the extension with the -d flag, and then run

```$bash
$ ./test/run_tests -p c
```

Test files are located at `src/common/test`. See `src/common/test/testSetup.js` for 
test framework documentation

# Developing

Zotero Connectors are built with standard tools, such as browser extension APIs, but the architecture is quite complex. 
This section is a short overview of some of the complexities, to make it more accessible for newcomers.

## Technologies

##### Chrome/Firefox Browser Extension Framework

The functionality exposed on Chrome and Firefox is provided by the Chrome extension framework,
which has also been adopted by Firefox. See [Chrome Extension docs](https://developer.chrome.com/extensions)
and [Firefox Extension docs](https://developer.mozilla.org/en-US/Add-ons/WebExtensions) for more information.

##### Safari Extension Framework

For Safari specifics see https://github.com/zotero/safari-app-extension

##### Zotero Translator Framework

The Connectors share code with [Zotero desktop application](https://github.com/zotero/zotero), to support translation.
A basic understanding of how translation works or at least the handlers it exposes in Zotero will be highly useful in
understanding the codebase.

## Components

Saving resources to Zotero library is facilitated by two major components: the Zotero Connector running in the browser
and either the Zotero client or zotero.org web api. The Zotero Connector itself is split into two components: 
code running on the webpage and a background process.

<img src="http://i.imgur.com/4r2qRqe.png" width="600"/>


##### a) Injected scripts for individual webpages

Each webpage is injected ([Chrome](https://developer.chrome.com/extensions/content_scripts)/[Firefox](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts)/[Safari](https://developer.apple.com/library/content/documentation/Tools/Conceptual/SafariExtensionGuide/InjectingScripts/InjectingScripts.html))
with a full Zotero [translation framework](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/gulpfile.js#L45-L79).
A [*Zotero.Translate.Web*](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/inject/inject.jsx#L314-L314) 
instance orchestrates running individual translators for detection and translation.

The translation framework shares some code with the Zotero codebase and provides custom classes concerning 
[translator retrieval](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/translators.js) 
and [item saving](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/translate_item.js).
These custom classes talk to the background process (b) of the Zotero Connector for functionality outside the translation
framework, such as retrieving translator code and sending translated items either to Zotero (c) or zotero.org (d).

##### b) Background process

The Connector runs a [background process](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/gulpfile.js#L95-L125) 
([Chrome](https://developer.chrome.com/extensions/event_pages)/[Firefox](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Anatomy_of_a_WebExtension#Background_scripts)/[Safari](https://developer.apple.com/library/content/documentation/Tools/Conceptual/SafariExtensionGuide/AddingaGlobalHTMLPage/AddingaGlobalHTMLPage.html))
which works as a middle-layer between the translation framework running in inject scripts (a) and Zotero (c) or zotero.org (d).

The background process maintains a cache of translators and performs the initial [translator detection using URL matching](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/translators.js#L140-L196).
Translators whose target regexp matches the URL of a given webpage are then further tested by running `detectWeb()` 
in injected scripts. A list of translators and their code is
fetched either from [Zotero (c) or zotero.org (d)](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/repo.js#L140-L155).

The background process is also responsible for updating the extension UI, kicking off translations, storing and 
retrieving connector preferences and sending translated items to Zotero or zotero.org. Browser specific scripts are
available for [BrowserExt](https://github.com/zotero/zotero-connectors/blob/master/src/browserExt/background.js)
and [Safari](https://github.com/zotero/zotero-connectors/blob/master/src/safari/global.html).

##### c) Connector server in Zotero

When Zotero is open it runs a [connector HTTP server](https://www.zotero.org/support/dev/client_coding/connector_http_server)
on port 23119. The HTTP server API accommodates interactions between the Connectors and Zotero client. Calls to
[*Zotero.Connector.callMethod(endpoint)*](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/connector.js#L150) 
in this codebase are translated to HTTP requests to the connector server.

Note that Zotero cannot interact with the connectors on its own accord. All communication is Connector initiated.

##### d) zotero.org API

When Zotero is not available item saving falls back to
using [zotero.org API](https://www.zotero.org/support/dev/web_api/v3/start).
The interactions with zotero.org API are defined in [api.js](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/api.js)

## Message passing

The only way for the background extension process and injected scripts to communicate is using the message passing
protocol provided by the browsers ([Chrome](https://developer.chrome.com/extensions/messaging)/[Firefox](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts#Communicating_with_background_scripts)/[Safari](https://developer.apple.com/library/content/documentation/Tools/Conceptual/SafariExtensionGuide/MessagesandProxies/MessagesandProxies.html)). 
Injected scripts often need to communicate to background scripts. To simplify
these interactions, calls to functions in background scripts are monkey-patched in injected scripts. These calls are
asynchronous and if a return value is required, it is provided either to a callback function as the last argument of
the call or as a resolving value of a promise returned.

[*messages.js*](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/messages.js)
contains the list of the monkey-patched methods. If the method value is false no response is expected, otherwise
the calls provide a response. An optional pre-send processing on the background end and post-receive processing
on the injected end is possible to treat values that cannot be sent as-is via the messaging protocol.

The background process registers message listeners in [*messaging.js*](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/messaging.js).
`Zotero.Messaging` class also provides a way to send messages to injected scripts and add custom message listeners.

The injected scripts monkey-patch methods in *messaging_injected.js*([BrowserExt](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/browserExt/messaging_inject.js)/[Safari](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/safari/messaging_inject.js))
`Zotero.Messaging` class also provides a way to send messages to the background process and add message listeners.


## Build process

The build process combines files from the Zotero codebase, common files to all connectors and specific files for
Chrome/Firefox/Safari connectors. At the moment the build process is awkward and uses a SH script and gulp procedures.
This will be reconciled in the future to only use gulp.

1. `build.sh` [copies images](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/build.sh#L183-L223) 
    and [extension files](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/build.sh#L226-L277)
1. `gulp process-custom-files` [initiated by](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/build.sh#L281-L286) 
   `build.sh` performs [post-processing](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/gulpfile.js#L157-L241)
    on copied files

## Contact

If you have any questions about developing Zotero Connectors you can join the discussion in the
[zotero-dev mailing list](https://groups.google.com/forum/#!forum/zotero-dev).
