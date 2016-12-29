#!/bin/bash -e

# Copyright (c) 2012  Zotero
#                     Center for History and New Media
#                     George Mason University, Fairfax, Virginia, USA
#                     http://zotero.org
# 
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# 
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

CWD="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
case "$(uname -s)" in
   CYGWIN*) IS_CYGWIN=1 ;;
esac
if [ -f "$CWD/config.sh" ]; then
	. "$CWD/config.sh"
fi

function explorerify {
	FROM="$1"
	TO="$2"
	
	# const -> var
	perl -pe "s/\bconst /var /" "$FROM" > "$TO"
	
	# a.indexOf(b) -> indexOf(a,b)
	perl -000 -pi -e 's/((?:[\w.]+|\[[^\]]*\])+)\.indexOf(\((((?>[^()]+)|(?2))*)\))/zindexOf($1, $3)/gs' \
		"$TO"
	
	# automatic unlinking of backup files is broken in Cygwin, so remove manually
	if [ -e "$TO.bak" ]; then
		rm "$TO.bak"
	fi
}

function usage {
	cat >&2 <<DONE
Usage: $0 [-v VERSION] [-d]
Options
 -v VERSION          use version VERSION
 -d                  build for debugging (enable translator tester, don't minify)
DONE
	exit 1
}

while getopts "v:d" opt; do
	case $opt in
		v)
			VERSION="$OPTARG"
			;;
		d)
			DEBUG=1
			;;
		*)
			usage
			;;
	esac
	shift $((OPTIND-1)); OPTIND=1
done

if [ ! -z $1 ]; then
	usage
fi

if [ -z $VERSION ]; then
	pushd "$CWD" > /dev/null
    if [ -z $DEFAULT_VERSION ]; then
        VERSION="5.0"
    else
        VERSION="$DEFAULT_VERSION"
    fi
	popd > /dev/null
fi

if [ -z "$BUILD_DIR" ]; then
	BUILD_DIR="$CWD/build"
	mkdir -p "$BUILD_DIR"
fi

if [ ! -d "$BUILD_DIR" ]; then
	echo "$BUILD_DIR is not a directory"
	exit 1
fi

SRCDIR="$CWD/src"
DISTDIR="$CWD/dist"
NODE_MODULES_DIR="$CWD/node_modules"
LOG="$CWD/build.log"

EXTENSION_XPCOM_DIR="$SRCDIR/zotero/chrome/content/zotero/xpcom"
EXTENSION_SKIN_DIR="$SRCDIR/zotero/chrome/skin/default/zotero"

SAFARI_EXT="$DISTDIR/Zotero_Connector-$VERSION.safariextz"
CHROME_EXT="$DISTDIR/Zotero_Connector-$VERSION.crx"

ICONS="$EXTENSION_SKIN_DIR/treeitem*png $EXTENSION_SKIN_DIR/treesource-collection.png $EXTENSION_SKIN_DIR/zotero-new-z-16px.png  \
    $SRCDIR/common/images/zotero-z-16px-offline.png"
IMAGES="$EXTENSION_SKIN_DIR/progress_arcs.png $EXTENSION_SKIN_DIR/cross.png $EXTENSION_SKIN_DIR/treesource-library.png"
PREFS_IMAGES="$EXTENSION_SKIN_DIR/prefs-general.png $EXTENSION_SKIN_DIR/prefs-advanced.png $EXTENSION_SKIN_DIR/prefs-proxies.png"

LIBS=("$NODE_MODULES_DIR/react/dist/react.js" "$NODE_MODULES_DIR/react-dom/dist/react-dom.js")

# Scripts to be included in bookmarklet
BOOKMARKLET_INJECT_INCLUDE=("$EXTENSION_XPCOM_DIR/connector/cachedTypes.js" \
	"$EXTENSION_XPCOM_DIR/date.js" \
	"$SRCDIR/common/inject/http.js" \
	"$EXTENSION_XPCOM_DIR/openurl.js" \
	"$SRCDIR/common/inject/progressWindow.js" \
	"$EXTENSION_XPCOM_DIR/rdf/init.js" \
	"$EXTENSION_XPCOM_DIR/rdf/uri.js" \
	"$EXTENSION_XPCOM_DIR/rdf/term.js" \
	"$EXTENSION_XPCOM_DIR/rdf/identity.js" \
	"$EXTENSION_XPCOM_DIR/rdf/match.js" \
	"$EXTENSION_XPCOM_DIR/rdf/rdfparser.js" \
	"$EXTENSION_XPCOM_DIR/translation/translate.js" \
	"$EXTENSION_XPCOM_DIR/connector/translate_item.js" \
	"$SRCDIR/common/inject/translate_inject.js" \
	"$EXTENSION_XPCOM_DIR/connector/typeSchemaData.js" \
	"$EXTENSION_XPCOM_DIR/utilities_translate.js" \
	"$SRCDIR/bookmarklet/messaging_inject.js" \
	"$SRCDIR/bookmarklet/inject_base.js")

BOOKMARKLET_IFRAME_INCLUDE=("$EXTENSION_XPCOM_DIR/connector/connector.js" \
	"$EXTENSION_XPCOM_DIR/translation/tlds.js" \
	"$SRCDIR/bookmarklet/translator.js" \
	"$SRCDIR/common/messaging.js" \
	"$SRCDIR/bookmarklet/iframe_base.js")

BOOKMARKLET_COMMON_INCLUDE=("$SRCDIR/bookmarklet/zotero_config.js" \
	"$EXTENSION_XPCOM_DIR/debug.js" \
	"$SRCDIR/common/errors_webkit.js" \
	"$SRCDIR/common/http.js" \
	"$EXTENSION_XPCOM_DIR/xregexp/xregexp.js" \
	"$EXTENSION_XPCOM_DIR/xregexp/addons/build.js" \
	"$EXTENSION_XPCOM_DIR/xregexp/addons/matchrecursive.js" \
	"$EXTENSION_XPCOM_DIR/xregexp/addons/unicode/unicode-base.js" \
	"$EXTENSION_XPCOM_DIR/xregexp/addons/unicode/unicode-categories.js" \
	"$EXTENSION_XPCOM_DIR/xregexp/addons/unicode/unicode-zotero.js" \
	"$EXTENSION_XPCOM_DIR/utilities.js" \
	"$SRCDIR/bookmarklet/messages.js")

BOOKMARKLET_INJECT_TEST_INCLUDE=( \
	"$SRCDIR/zotero/chrome/content/zotero/tools/testTranslators/translatorTester.js" \
	"$SRCDIR/bookmarklet/translator.js" \
	"$SRCDIR/bookmarklet/test.js")
	
BOOKMARKLET_AUXILIARY_JS=( \
	"$SRCDIR/bookmarklet/loader.js" \
	"$SRCDIR/bookmarklet/ie_hack.js" \
	"$SRCDIR/bookmarklet/itemSelector/itemSelector_browserSpecific.js" \
	"$SRCDIR/bookmarklet/upload.js" )

# Remove log file
rm -f "$LOG"

# Remove old build directories
rm -rf "$BUILD_DIR/browserExt" "$BUILD_DIR/safari.safariextension" "$BUILD_DIR/bookmarklet"

# Make directories if they don't exist
for dir in "$DISTDIR" \
	"$BUILD_DIR/safari.safariextension" \
	"$BUILD_DIR/browserExt" \
	"$BUILD_DIR/bookmarklet"; do
	if [ ! -d "$dir" ]; then
		mkdir "$dir"
	fi
done

echo -n "Building connectors..."

# Make alpha images for Safari
rm -rf "$BUILD_DIR/safari.safariextension/images"
mkdir "$BUILD_DIR/safari.safariextension/images"
mkdir "$BUILD_DIR/safari.safariextension/images/toolbar"
set +e
convert -version > /dev/null 2>&1
RETVAL=$?
set -e
if [ $RETVAL == 0 ]; then
	cp $ICONS "$BUILD_DIR/safari.safariextension/images"
	cp $IMAGES $PREFS_IMAGES "$BUILD_DIR/safari.safariextension/images"
	for f in $ICONS
	do
		convert $f -background white -flatten -negate -alpha Background -alpha Copy -channel \
				Opacity -contrast-stretch 50 "$BUILD_DIR/safari.safariextension/images/toolbar/"`basename $f`
	done
else
	echo
	echo "ImageMagick not installed; not creating monochrome Safari icons"
	cp $ICONS "$BUILD_DIR/safari.safariextension/images"
	cp $ICONS "$BUILD_DIR/safari.safariextension/images/toolbar"
	cp $IMAGES $PREFS_IMAGES "$BUILD_DIR/safari.safariextension/images"
fi
cp "$CWD/icons/Icon-32.png" "$CWD/icons/Icon-48.png" "$CWD/icons/Icon-64.png" \
	"$BUILD_DIR/safari.safariextension"

# Copy images for Chrome
rm -rf "$BUILD_DIR/browserExt/images"
mkdir "$BUILD_DIR/browserExt/images"
cp $ICONS $IMAGES $PREFS_IMAGES "$BUILD_DIR/browserExt/images"
# Use larger icons where available, since Chrome actually wants 19px icons
# 2x
for img in "$BUILD_DIR"/browserExt/images/*2x.png; do
	mv $img `echo $img | sed 's/@2x//'`
done
## 2.5x
for img in "$BUILD_DIR"/browserExt/images/*48px.png; do
	mv $img `echo $img | sed 's/@48px//'`
done

cp "$CWD/icons/Icon-16.png" "$CWD/icons/Icon-48.png" "$CWD/icons/Icon-96.png" "$CWD/icons/Icon-128.png" "$BUILD_DIR/browserExt"


# Copy translation-related resources for Chrome/Safari
for browser in "browserExt" "safari"; do
	if [ "$browser" == "safari" ]; then
		browser_builddir="$BUILD_DIR/safari.safariextension"
	else
		browser_builddir="$BUILD_DIR/$browser"
	fi
	browser_srcdir="$SRCDIR/$browser"
	
	# Copy common files
	pushd "$SRCDIR/common" > /dev/null
	find . -not \( -name ".?*" -prune \) -not -name "." -type d -exec mkdir -p "$browser_builddir/"{} \;
	find . -not \( -name ".?*" -prune \) -type f -exec cp -r {} "$browser_builddir/"{} \;
	popd > /dev/null
	
	# Copy browser-specific files
	pushd "$browser_srcdir" > /dev/null
	find . -not \( -name ".?*" -prune \) -not -name "." -type d -exec mkdir -p "$browser_builddir/"{} \;
	find . -not \( -name ".?*" -prune \) -type f -exec cp -r {} "$browser_builddir/"{} \;
	popd > /dev/null
	
	# Set version
	perl -pi -e 's/^(\s*this.version\s*=\s*)"[^"]*"/$1"'"$VERSION"'"/' "$browser_builddir/zotero.js"
	
	# Copy extension pieces
	mkdir "$browser_builddir/zotero"
	cp -r "$EXTENSION_XPCOM_DIR/utilities.js" \
	   "$EXTENSION_XPCOM_DIR/utilities_translate.js" \
	   "$EXTENSION_XPCOM_DIR/date.js" \
	   "$EXTENSION_XPCOM_DIR/debug.js" \
	   "$EXTENSION_XPCOM_DIR/openurl.js" \
	   "$EXTENSION_XPCOM_DIR/rdf" \
	   "$EXTENSION_XPCOM_DIR/xregexp" \
	   "$browser_builddir/zotero"
	mkdir "$browser_builddir/zotero/translation"
	cp "$EXTENSION_XPCOM_DIR/translation/translate.js" \
	   "$EXTENSION_XPCOM_DIR/translation/translator.js" \
	   "$EXTENSION_XPCOM_DIR/translation/tlds.js" \
	   "$browser_builddir/zotero/translation"
	
	# Copy node_modules libs
	mkdir "$browser_builddir/lib"
	cp "${LIBS[@]}" "$browser_builddir/lib"
	
	if [ ! -z $DEBUG ]; then
		cp "$SRCDIR/zotero/chrome/content/zotero/tools/testTranslators"/*.js \
			"$SRCDIR/zotero/chrome/content/zotero/tools/testTranslators"/*.css \
			"$browser_builddir/tools/testTranslators"
	else
		rm -rf "$browser_builddir/tools"
	fi
done
	
# Update scripts
if [ ! -z $DEBUG ]; then
	gulp process-custom-scripts --version "$VERSION" > /dev/null 2>&1
else
	gulp process-custom-scripts --version "$VERSION" -p > /dev/null 2>&1
fi

echo "done"

# Build Chrome extension
if [ -e "$CHROME_CERTIFICATE" -a -e "$CHROME_EXECUTABLE" ]; then
	echo -n "Building Chrome extension..."
	if "$CHROME_EXECUTABLE" --pack-extension="$BUILD_DIR/browserExt" --pack-extension-key="$CHROME_CERTIFICATE" >> "$LOG" 2>&1
	then
		echo "succeeded"
		mv "$BUILD_DIR/chrome.crx" "$CHROME_EXT"
	else
		echo "failed"
	fi
else
	echo "No Chrome certificate found; not building Chrome extension"
fi

# Build Safari extension
if [ -e "$SAFARI_PRIVATE_KEY" -a -e "$XAR_EXECUTABLE" ]; then
	echo -n "Building Safari extension..."
	rm -f "$SAFARI_EXT"
	
	# Make a temporary directory
	TMP_BUILD_DIR="/tmp/zotero-connector-safari-build"
	rm -rf "$TMP_BUILD_DIR"
	mkdir "$TMP_BUILD_DIR"
	
	# Get size of signature
	SIGSIZE=`: | openssl dgst -sign "$SAFARI_PRIVATE_KEY" -binary | wc -c`
	
	# Make XAR
	pushd "$BUILD_DIR" > /dev/null
	if "$XAR_EXECUTABLE" -cf "$SAFARI_EXT" --distribution "`basename \"$BUILD_DIR/safari.safariextension\"`" &&
		popd > /dev/null &&
		# Convert pem certificate to der
		openssl x509 -outform der -in "$SAFARI_PRIVATE_KEY" -out "$TMP_BUILD_DIR/safari_key.der" >> "$LOG" && 
		# Make signature data
		"$XAR_EXECUTABLE" --sign -f "$SAFARI_EXT" \
			--data-to-sign "$TMP_BUILD_DIR/safari_sha1.dat"  --sig-size $SIGSIZE \
			--cert-loc="$TMP_BUILD_DIR/safari_key.der" --cert-loc="$SAFARI_AUX_CERTIFICATE1" \
			--cert-loc="$SAFARI_AUX_CERTIFICATE2" >> "$LOG" 2>&1 &&
		# Sign signature data
		(echo "3021300906052B0E03021A05000414" | xxd -r -p; cat "$TMP_BUILD_DIR/safari_sha1.dat") \
			| openssl rsautl -sign -inkey "$SAFARI_PRIVATE_KEY" > "$TMP_BUILD_DIR/signature.dat" &&
		# Inject signature
		"$XAR_EXECUTABLE" --inject-sig "$TMP_BUILD_DIR/signature.dat" -f "$SAFARI_EXT" >> "$LOG" 2>&1
	then
		echo "succeeded"
	else
		echo "failed"
	fi
	# Delete converted signature
	rm -fP "$TMP_BUILD_DIR/safari_key.der"
else
	echo "No Safari certificate found; not building Safari extension"
fi

echo -n "Building bookmarklet..."

# Make bookmarklet
for scpt in "iframe" "common" "inject"
do
	tmpScript="$BUILD_DIR/bookmarklet/${scpt}_tmp.js"
	
	if [ "$scpt" == "iframe" ]; then
		files=("${BOOKMARKLET_IFRAME_INCLUDE[@]}")
	elif [ "$scpt" == "common" ]; then
		files=("${BOOKMARKLET_COMMON_INCLUDE[@]}")
		
		echo "/******** BEGIN zotero.js ********/" >> "$tmpScript"
		perl -p -e 's/^(\s*this.version\s*=\s*)"[^"]*"/$1"'"$VERSION"'"/' "$SRCDIR/common/zotero.js" | LC_CTYPE=C tr -d '\r' >> "$tmpScript"
		echo "" >> "$tmpScript"
		echo "/******** END zotero.js ********/" >> "$tmpScript"
	elif [ "$scpt" == "inject" ]; then
		files=("${BOOKMARKLET_INJECT_INCLUDE[@]}")
	fi
	
	# Bundle scripts
	for f in "${files[@]}"
	do
		# Remove Windows CRs when bundling
		echo "/******** BEGIN `basename $f` ********/"
		LC_CTYPE=C tr -d '\r' < $f
		echo ""
		echo "/******** END `basename $f` ********/"
	done >> "$tmpScript"
	builtScript="$BUILD_DIR/bookmarklet/${scpt}.js"
	ieTmpScript="$BUILD_DIR/bookmarklet/${scpt}_ie_tmp.js"
	ieBuiltScript="$BUILD_DIR/bookmarklet/${scpt}_ie.js"
	
	if [ "$scpt" == "inject" ]; then
		if [ ! -z $DEBUG ]; then
			# Make test scripts
			if [ ! -d "$BUILD_DIR/bookmarklet/tests" ]; then
				mkdir "$BUILD_DIR/bookmarklet/tests"
			fi
			testScript="$BUILD_DIR/bookmarklet/tests/inject_test.js"
			ieTestScript="$BUILD_DIR/bookmarklet/tests/inject_ie_test.js"
			
			# Make inject_test.js
			cat "$BUILD_DIR/bookmarklet/common.js" "$tmpScript" > "$testScript"
			for f in "${BOOKMARKLET_INJECT_TEST_INCLUDE[@]}"
			do
				echo "/******** BEGIN `basename $f` ********/"
				LC_CTYPE=C tr -d '\r' < $f
				echo ""
				echo "/******** END `basename $f` ********/"
			done >> "$testScript"
			
			# Make inject_ie_test.js
			explorerify "$testScript" "$ieBuiltScript"
			cat "$SRCDIR/bookmarklet/ie_compat.js" \
				"$SRCDIR/bookmarklet/iframe_ie_compat.js" \
				"$ieBuiltScript" \
				"$SRCDIR/bookmarklet/inject_ie_compat.js" > "$ieTestScript"
			rm "$ieBuiltScript"
		fi
	fi
	
	explorerify "$tmpScript" "$ieTmpScript"
	if [ "$scpt" == "common" ]; then
		cat "$SRCDIR/bookmarklet/ie_compat.js" >> "$ieTmpScript"
	elif [ "$scpt" == "iframe" ]; then
		cat "$SRCDIR/bookmarklet/iframe_ie_compat.js" >> "$ieTmpScript"
	elif [ "$scpt" == "inject" ]; then
		cat "$SRCDIR/bookmarklet/inject_ie_compat.js" >> "$ieTmpScript";
	fi
	
	# Transpile. Minify if not in debug mode
	if [ ! -z $DEBUG ]; then
		"$CWD/node_modules/babel-cli/bin/babel.js" "$tmpScript" --out-file "$builtScript" --presets es2015 -q >> "$LOG" 2>&1
		"$CWD/node_modules/babel-cli/bin/babel.js" "$ieTmpScript" --out-file "$ieBuiltScript" --presets es2015 -q >> "$LOG" 2>&1
		rm "$tmpScript" "$ieTmpScript"
	else
		"$CWD/node_modules/babel-cli/bin/babel.js" "$tmpScript" --out-file "$builtScript" --presets es2015,babili --no-comments -q >> "$LOG" 2>&1
		"$CWD/node_modules/babel-cli/bin/babel.js" "$ieTmpScript" --out-file "$ieBuiltScript" --presets es2015,babili --no-comments -q >> "$LOG" 2>&1
		rm "$tmpScript" "$ieTmpScript"
	fi
done

# Copy/minify auxiliary JS
	if [ ! -z $DEBUG ]; then
	cp "${BOOKMARKLET_AUXILIARY_JS[@]}" "$BUILD_DIR/bookmarklet"
else	
	for scpt in "${BOOKMARKLET_AUXILIARY_JS[@]}"
	do
		"$CWD/node_modules/babel-cli/bin/babel.js" "$scpt" --out-file "$BUILD_DIR/bookmarklet/`basename \"$scpt\"`" --presets es2015,babili --no-comments -q >> "$LOG" 2>&1
	done
fi

# Copy HTML to dist directory
cp "$SRCDIR/bookmarklet/bookmarklet.html" \
	"$SRCDIR/bookmarklet/debug_mode.html" \
	"$SRCDIR/bookmarklet/iframe.html" \
	"$SRCDIR/bookmarklet/iframe_ie.html" \
	"$SRCDIR/bookmarklet/auth_complete.html" \
	"$SRCDIR/common/itemSelector/"* \
	"$BUILD_DIR/bookmarklet"
cp "$SRCDIR/bookmarklet/htaccess" "$BUILD_DIR/bookmarklet/.htaccess"
rm -rf "$BUILD_DIR/bookmarklet/images"
mkdir "$BUILD_DIR/bookmarklet/images"
cp $ICONS $IMAGES "$BUILD_DIR/bookmarklet/images"
echo "done"