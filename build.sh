#!/bin/bash

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
. "$CWD/config.sh"

function explorerify {
	FROM="$1"
	TO="$2"
	
	# const -> var
	perl -pe "s/\bconst /var /" "$FROM" > "$TO"
	
	# a.indexOf(b) -> indexOf(a,b)
	perl -000 -pi -e 's/((?:[\w.]+|\[[^\]]*\])+)\.indexOf(\((((?>[^()]+)|(?2))*)\))/indexOf($1, $3)/gs' \
		"$TO"
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
	REV=`git log -n 1 --pretty='format:%h'`
	VERSION="$DEFAULT_VERSION"
	popd
fi

SRCDIR="$CWD/src"
BUILDDIR="$CWD/build"
DISTDIR="$CWD/dist"
LOG="$CWD/build.log"

EXTENSION_XPCOM_DIR="$SRCDIR/zotero/chrome/content/zotero/xpcom"
EXTENSION_SKIN_DIR="$SRCDIR/zotero/chrome/skin/default/zotero"

SAFARI_EXT="$DISTDIR/Zotero_Connector.safariextz"
CHROME_EXT="$DISTDIR/Zotero_Connector.crx"

ICONS="$EXTENSION_SKIN_DIR/treeitem*png $EXTENSION_SKIN_DIR/treesource-collection.png $EXTENSION_SKIN_DIR/zotero-z-16px.png"
IMAGES="$EXTENSION_SKIN_DIR/progress_arcs.png $EXTENSION_SKIN_DIR/cross.png $EXTENSION_SKIN_DIR/treesource-library.png"
PREFS_IMAGES="$EXTENSION_SKIN_DIR/prefs-general.png $EXTENSION_SKIN_DIR/prefs-advanced.png"

# Scripts to be included in inject scripts
INJECT_INCLUDE=('zotero.js' \
	'zotero_config.js' \
	'http.js' \
	'zotero/connector/cachedTypes.js' \
	'zotero/date.js' \
	'zotero/debug.js' \
	'zotero/openurl.js' \
	'zotero/rdf/init.js' \
	'zotero/rdf/uri.js' \
	'zotero/rdf/term.js' \
	'zotero/rdf/identity.js' \
	'zotero/rdf/match.js' \
	'zotero/rdf/rdfparser.js' \
	'zotero/translation/translate.js' \
	'zotero/connector/translate_item.js' \
	'zotero/utilities.js' \
	'zotero/utilities_translate.js' \
	'inject/http.js' \
	'inject/progressWindow.js' \
	'inject/translator.js' \
	'inject/translate_inject.js'\
	'messages.js' \
	'messaging_inject.js')

# Scripts to be included in one browser only
INJECT_INCLUDE_CHROME=('api.js')
INJECT_INCLUDE_SAFARI=()

if [ "$1" == "debug" ]; then
	INJECT_INCLUDE_LAST=('tools/testTranslators/translatorTester_messages.js' \
		'tools/testTranslators/translatorTester.js' \
		'inject/inject.js' \
		'tools/testTranslators/translatorTester_inject.js')
else
	INJECT_INCLUDE_LAST=('inject/inject.js')
fi

# Scripts to be included in background page
GLOBAL_INCLUDE=('zotero.js' \
	'zotero_config.js' \
	'errors_webkit.js' \
	'api.js' \
	'http.js' \
	'oauthsimple.js' \
	'zotero/connector/connector.js' \
	'zotero/connector/cachedTypes.js' \
	'zotero/date.js' \
	'zotero/debug.js' \
	'zotero/openurl.js' \
	'zotero/connector/repo.js' \
	'zotero/translation/tlds.js' \
	'zotero/connector/translator.js' \
	'zotero/connector/typeSchemaData.js' \
	'zotero/utilities.js' \
	'messages.js' \
	'messaging.js')
if [ ! -z $DEBUG ]; then
	GLOBAL_INCLUDE=("${GLOBAL_INCLUDE[@]}" \
		'tools/testTranslators/translatorTester_messages.js' \
		'tools/testTranslators/translatorTester.js' \
		'tools/testTranslators/translatorTester_global.js')
fi

INJECT_END_CHROME='\t\t\t\],'
INJECT_BEGIN_SAFARI='<key>Scripts<\/key>\n\t\t<dict>\n\t\t\t<key>End<\/key>\n\t\t\t<array>'
INJECT_END_SAFARI='\t\t\t<\/array>'

GLOBAL_BEGIN='<!--BEGIN GLOBAL SCRIPTS-->'
GLOBAL_END='<!--END GLOBAL SCRIPTS-->'

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
	"$SRCDIR/common/inject/translator.js" \
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
rm -rf "$BUILDDIR/chrome" "$BUILDDIR/safari.safariextension" "$BUILDDIR/bookmarklet"

# Make directories if they don't exist
for dir in "$DISTDIR" \
	"$BUILDDIR" \
	"$BUILDDIR/safari.safariextension" \
	"$BUILDDIR/chrome" \
	"$BUILDDIR/bookmarklet"; do
	if [ ! -d "$dir" ]; then
		mkdir "$dir"
	fi
done

echo -n "Building connectors..."

# Make alpha images for Safari
rm -rf "$BUILDDIR/safari.safariextension/images"
mkdir "$BUILDDIR/safari.safariextension/images"
mkdir "$BUILDDIR/safari.safariextension/images/itemTypes"
mkdir "$BUILDDIR/safari.safariextension/images/toolbar"
convert -version > /dev/null 2>&1
if [ $? == 0 ]; then
	cp $ICONS "$BUILDDIR/safari.safariextension/images/itemTypes"
	cp $IMAGES $PREFS_IMAGES "$BUILDDIR/safari.safariextension/images"
	for f in $ICONS
	do
		convert $f -background white -flatten -negate -alpha Background -alpha Copy -channel \
				Opacity -contrast-stretch 50 "$BUILDDIR/safari.safariextension/images/toolbar/"`basename $f`
	done
else
	echo "ImageMagick not installed; not creating monochrome Safari icons"
	cp $ICONS "$BUILDDIR/safari.safariextension/images/itemTypes"
	cp $ICONS "$BUILDDIR/safari.safariextension/images/toolbar"
	cp $IMAGES $PREFS_IMAGES "$BUILDDIR/safari.safariextension/images"
fi
cp "$CWD/icons/Icon-32.png" "$CWD/icons/Icon-48.png" "$BUILDDIR/safari.safariextension"

# Copy images for Chrome
rm -rf "$BUILDDIR/chrome/images"
mkdir "$BUILDDIR/chrome/images"
cp $ICONS $IMAGES $PREFS_IMAGES "$BUILDDIR/chrome/images"
cp "$CWD/icons/Icon-16.png" "$CWD/icons/Icon-48.png" "$CWD/icons/Icon-128.png" "$BUILDDIR/chrome"

globalScripts=$(printf '<script type="text/javascript" src="%s"></script>\\n' "${GLOBAL_INCLUDE[@]}")

# Copy translation-related resources for Chrome/Safari
for browser in "chrome" "safari"; do
	if [ "$browser" == "safari" ]; then
		browser_builddir="$BUILDDIR/safari.safariextension"
	else
		browser_builddir="$BUILDDIR/$browser"
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
	
	# Update global scripts
	perl -000 -pe "s|<!--SCRIPTS-->|\\n$globalScripts|s" "$browser_srcdir/global.html" > "$browser_builddir/global.html"
	
	# Comment/uncomment debug code in preferences
	if [ ! -z $DEBUG ]; then
		perl -000 -pi -e 's/<!--BEGIN DEBUG(\s.*?\s)END DEBUG-->/<!--BEGIN DEBUG-->$1<!--END DEBUG-->/sg' "$browser_builddir/preferences/preferences.html"
	else
		perl -000 -pi -e 's/<!--BEGIN DEBUG-->(.*?)<!--END DEBUG-->//sg' "$browser_builddir/preferences/preferences.html"
	fi
	
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
	   "$EXTENSION_XPCOM_DIR/connector" \
	   "$browser_builddir/zotero"
	mkdir "$browser_builddir/zotero/translation"
	cp "$EXTENSION_XPCOM_DIR/translation/translate.js" \
	   "$EXTENSION_XPCOM_DIR/translation/tlds.js" \
	   "$browser_builddir/zotero/translation"
	
	if [ ! -z $DEBUG ]; then
		cp "$SRCDIR/zotero/chrome/content/zotero/tools/testTranslators"/*.js \
			"$SRCDIR/zotero/chrome/content/zotero/tools/testTranslators"/*.css \
			"$browser_builddir/tools/testTranslators"
	else
		rm -rf "$browser_builddir/tools"
	fi
done

# Update Chrome manifest.json
inject_scripts=("${INJECT_INCLUDE[@]}" "${INJECT_INCLUDE_CHROME[@]}" "${INJECT_INCLUDE_LAST[@]}")
scripts=$(printf '\\t\\t\\t\\t"%s",\\n' "${inject_scripts[@]}")
perl -pe 's|/\*SCRIPTS\*/|'"${scripts:8:$((${#scripts}-11))}|s" "$SRCDIR/chrome/manifest.json" \
| perl -p -e 's|("version":\s*)"[^"]*"|$1"'"$VERSION"'"|' \
> "$BUILDDIR/chrome/manifest.json"

# Update Safari Info.plist
inject_scripts=("${INJECT_INCLUDE[@]}" "${INJECT_INCLUDE_SAFARI[@]}" "${INJECT_INCLUDE_LAST[@]}")
scripts=$(printf '\\t\\t\\t\\t<string>%s</string>\\n' "${inject_scripts[@]}")
perl -pe "s|<!--SCRIPTS-->|${scripts:8:$((${#scripts}-10))}|s" "$SRCDIR/safari/Info.plist" \
| perl -000 -p -e 's|(<key>(?:CFBundleShortVersionString\|CFBundleVersion)</key>\s*)<string>[^<]*</string>|$1<string>'"$VERSION"'</string>|sg' \
> "$BUILDDIR/safari.safariextension/Info.plist"

echo "done"

# Build Chrome extension
if [ -e "$CHROME_CERTIFICATE" -a -e "$CHROME_EXECUTABLE" ]; then
	echo -n "Building Chrome extension..."
	if "$CHROME_EXECUTABLE" --pack-extension="$BUILDDIR/chrome" --pack-extension-key="$CHROME_CERTIFICATE" >> "$LOG" 2>&1
	then
		echo "succeeded"
		mv "$BUILDDIR/chrome.crx" "$CHROME_EXT"
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
	pushd "$BUILDDIR" > /dev/null
	if "$XAR_EXECUTABLE" -cf "$SAFARI_EXT" --distribution "`basename \"$BUILDDIR/safari.safariextension\"`" &&
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
	tmpScript="$BUILDDIR/bookmarklet/${scpt}_tmp.js"
	
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

	tmpScript="$BUILDDIR/bookmarklet/${scpt}_tmp.js"
	builtScript="$BUILDDIR/bookmarklet/${scpt}.js"
	ieTmpScript="$BUILDDIR/bookmarklet/${scpt}_ie_tmp.js"
	ieBuiltScript="$BUILDDIR/bookmarklet/${scpt}_ie.js"
	
	if [ "$scpt" == "inject" ]; then
		if [ ! -z $DEBUG ]; then
			# Make test scripts
			if [ ! -d "$BUILDDIR/bookmarklet/tests" ]; then
				mkdir "$BUILDDIR/bookmarklet/tests"
			fi
			testScript="$BUILDDIR/bookmarklet/tests/inject_test.js"
			ieTestScript="$BUILDDIR/bookmarklet/tests/inject_ie_test.js"
			
			# Make inject_test.js
			cat "$BUILDDIR/bookmarklet/common.js" "$tmpScript" > "$testScript"
			for f in "${BOOKMARKLET_INJECT_TEST_INCLUDE[@]}"
			do
				echo "/******** BEGIN `basename $f` ********/"
				LC_CTYPE=C tr -d '\r' < $f
				echo ""
				echo "/******** END `basename $f` ********/"
			done >> "$testScript"
			
			# Make inject_ie_test.js
			explorerify "$testScript" "$ieBuiltScript"
			cat "$SRCDIR/bookmarklet/ie_compat.js" "$ieBuiltScript" "$SRCDIR/bookmarklet/inject_ie_compat.js" > "$ieTestScript"
			rm "$ieBuiltScript"
		fi
	fi
	
	
	explorerify "$tmpScript" "$ieTmpScript"
	if [ "$scpt" == "common" ]; then
		cp "$ieTmpScript" "$ieBuiltScript"
		cat "$SRCDIR/bookmarklet/ie_compat.js" "$ieBuiltScript" > "$ieTmpScript"
		rm "$ieBuiltScript"
	fi
	
	# Minify if not in debug mode
	if [ ! -z $DEBUG ]; then
		mv "$tmpScript" "$builtScript"
		mv "$ieTmpScript" "$ieBuiltScript"
	else
		uglifyjs "$tmpScript" > "$builtScript"
		uglifyjs "$ieTmpScript" > "$ieBuiltScript"
		rm "$tmpScript" "$ieTmpScript"
	fi
	
	if [ "$scpt" == "inject" ]; then
		# Currently this part can't be minified
		cat "$SRCDIR/bookmarklet/inject_ie_compat.js" >> "$ieBuiltScript";
	fi
done

# Copy/uglify auxiliary JS
	if [ ! -z $DEBUG ]; then
	cp "${BOOKMARKLET_AUXILIARY_JS[@]}" "$BUILDDIR/bookmarklet"
else	
	for scpt in "${BOOKMARKLET_AUXILIARY_JS[@]}"
	do
		uglifyjs "$scpt" > "$BUILDDIR/bookmarklet/`basename \"$scpt\"`"
	done
fi

# Copy HTML to dist directory
cp "$SRCDIR/bookmarklet/bookmarklet.html" \
	"$SRCDIR/bookmarklet/debug_mode.html" \
	"$SRCDIR/bookmarklet/iframe.html" \
	"$SRCDIR/bookmarklet/iframe_ie.html" \
	"$SRCDIR/bookmarklet/auth_complete.html" \
	"$SRCDIR/common/itemSelector/"* \
	"$BUILDDIR/bookmarklet"
cp "$SRCDIR/bookmarklet/htaccess" "$BUILDDIR/bookmarklet/.htaccess"
rm -rf "$BUILDDIR/bookmarklet/images"
mkdir "$BUILDDIR/bookmarklet/images"
cp $ICONS $IMAGES "$BUILDDIR/bookmarklet/images"
echo "done"