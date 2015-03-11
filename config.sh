#!/bin/sh
CWD="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_CERTIFICATE="`dirname $CWD`/zotero_chrome.pem"
echo $CHROME_CERTIFICATE

# This must be xar from https://code.google.com/p/xar/issues/detail?id=76
XAR_EXECUTABLE=/usr/local/bin/xar
SAFARI_PRIVATE_KEY="`dirname $CWD`/zotero_safari.pem"
SAFARI_AUX_CERTIFICATE1="`dirname $CWD`/zotero_safari_aux1.der"
SAFARI_AUX_CERTIFICATE2="`dirname $CWD`/zotero_safari_aux2.der"

DEFAULT_VERSION="3.0.999"
