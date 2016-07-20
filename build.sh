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

function minify {
	FROM="$1"
	TO="$2"
	
	# Get system path if running in Cygwin so that uglifyjs can access it
	if [ ! -z $IS_CYGWIN ]; then
		FROM="`cygpath -w \"$FROM\"`"
	fi
	
	uglifyjs "$FROM" > "$TO"
	
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
LOG="$CWD/build.log"

EXTENSION_XPCOM_DIR="$SRCDIR/zotero/chrome/content/zotero/xpcom"
EXTENSION_SKIN_DIR="$SRCDIR/zotero/chrome/skin/default/zotero"

SAFARI_EXT="$DISTDIR/Zotero_Connector-$VERSION.safariextz"
CHROME_EXT="$DISTDIR/Zotero_Connector-$VERSION.crx"

ICONS="$EXTENSION_SKIN_DIR/treeitem*png $EXTENSION_SKIN_DIR/treesource-collection.png $EXTENSION_SKIN_DIR/zotero-new-z-16px.png"
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
	"zotero/xregexp/xregexp.js" \
	"zotero/xregexp/addons/build.js" \
	"zotero/xregexp/addons/matchrecursive.js" \
	"zotero/xregexp/addons/unicode/unicode-base.js" \
	"zotero/xregexp/addons/unicode/unicode-categories.js" \
	"zotero/xregexp/addons/unicode/unicode-zotero.js" \
	'zotero/rdf/init.js' \
	'zotero/rdf/uri.js' \
	'zotero/rdf/term.js' \
	'zotero/rdf/identity.js' \
	'zotero/rdf/match.js' \
	'zotero/rdf/rdfparser.js' \
	'zotero/translation/translate.js' \
	'zotero/connector/translate_item.js' \
	'zotero/connector/typeSchemaData.js' \
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

if [ ! -z $DEBUG ]; then
	INJECT_INCLUDE_LAST=('tools/testTranslators/translatorTester_messages.js' \
		'tools/testTranslators/translatorTester.js' \
		'inject/inject.js' \
		'tools/testTranslators/translatorTester_inject.js')
else
	INJECT_INCLUDE_LAST=('inject/inject.js')
fi

# Scripts to be included in background page
BACKGROUND_INCLUDE=('zotero.js' \
	'zotero_config.js' \
	'errors_webkit.js' \
	'api.js' \
	'http.js' \
	'oauthsimple.js' \
	'zotero/connector/connector.js' \
	'zotero/connector/cachedTypes.js' \
	'zotero/date.js' \
	'zotero/debug.js' \
	"zotero/xregexp/xregexp.js" \
	"zotero/xregexp/addons/build.js" \
	"zotero/xregexp/addons/matchrecursive.js" \
	"zotero/xregexp/addons/unicode/unicode-base.js" \
	"zotero/xregexp/addons/unicode/unicode-categories.js" \
	"zotero/xregexp/addons/unicode/unicode-zotero.js" \
	'zotero/openurl.js' \
	'zotero/connector/repo.js' \
	'zotero/translation/tlds.js' \
	'zotero/connector/translator.js' \
	'zotero/connector/typeSchemaData.js' \
	'zotero/utilities.js' \
	'messages.js' \
	'messaging.js')
if [ ! -z $DEBUG ]; then
	BACKGROUND_INCLUDE=("${BACKGROUND_INCLUDE[@]}" \
		'tools/testTranslators/translatorTester_messages.js' \
		'tools/testTranslators/translatorTester.js' \
		'tools/testTranslators/translatorTester_global.js')
fi

INJECT_END_CHROME='\t\t\t\],'
INJECT_BEGIN_SAFARI='<key>Scripts<\/key>\n\t\t<dict>\n\t\t\t<key>End<\/key>\n\t\t\t<array>'
INJECT_END_SAFARI='\t\t\t<\/array>'

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
rm -rf "$BUILD_DIR/chrome" "$BUILD_DIR/safari.safariextension" "$BUILD_DIR/bookmarklet"

# Make directories if they don't exist
for dir in "$DISTDIR" \
	"$BUILD_DIR/safari.safariextension" \
	"$BUILD_DIR/chrome" \
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
rm -rf "$BUILD_DIR/chrome/images"
mkdir "$BUILD_DIR/chrome/images"
cp $ICONS $IMAGES $PREFS_IMAGES "$BUILD_DIR/chrome/images"
# Use larger icons where available, since Chrome actually wants 19px icons
# 2x
for img in "$BUILD_DIR"/chrome/images/*2x.png; do
	mv $img `echo $img | sed 's/@2x//'`
done
## 2.5x
for img in "$BUILD_DIR"/chrome/images/*48px.png; do
	mv $img `echo $img | sed 's/@48px//'`
done

cp "$CWD/icons/Icon-16.png" "$CWD/icons/Icon-48.png" "$CWD/icons/Icon-128.png" "$BUILD_DIR/chrome"


# Copy translation-related resources for Chrome/Safari
for browser in "chrome" "safari"; do
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
	   "$EXTENSION_XPCOM_DIR/connector" \
	   "$EXTENSION_XPCOM_DIR/rdf" \
	   "$EXTENSION_XPCOM_DIR/xregexp" \
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
	
# Update Safari global scripts

# Update Chrome manifest.json
inject_scripts=("${INJECT_INCLUDE[@]}" "${INJECT_INCLUDE_CHROME[@]}" "${INJECT_INCLUDE_LAST[@]}")
inject_scripts=$(printf '\\t\\t\\t\\t"%s",\\n' "${inject_scripts[@]}")
background_scripts=$(printf '\\t\\t\\t"%s",\\n' "${BACKGROUND_INCLUDE[@]}")
web_accessible_resources=''
for img in $ICONS $IMAGES; do
	web_accessible_resources="$web_accessible_resources"'		"images/'"`basename \"$img\"`"'",
'
done
perl -pe 's|/\*BACKGROUND SCRIPTS\*/|'"${background_scripts:6:$((${#background_scripts}-8))}|s" "$SRCDIR/chrome/manifest.json" \
| perl -pe 's|/\*INJECT SCRIPTS\*/|'"${inject_scripts:8:$((${#inject_scripts}-11))}|s" \
| perl -pe 's|("version":\s*)"[^"]*"|$1"'"$VERSION"'"|' \
| perl -pe 's|/\*WEB ACCESSIBLE RESOURCES\*/|'"${web_accessible_resources:2:$((${#web_accessible_resources}-4))}|s" \
> "$BUILD_DIR/chrome/manifest.json"

# Update Safari Info.plist
global_scripts=$(printf '<script type="text/javascript" src="%s"></script>\\n' "${BACKGROUND_INCLUDE[@]}")
perl -000 -pe "s|<!--SCRIPTS-->|\\n${global_scripts}|s" "$SRCDIR/safari/global.html" > "$BUILD_DIR/safari.safariextension/global.html"
inject_scripts=("${INJECT_INCLUDE[@]}" "${INJECT_INCLUDE_SAFARI[@]}" "${INJECT_INCLUDE_LAST[@]}")
scripts=$(printf '\\t\\t\\t\\t<string>%s</string>\\n' "${inject_scripts[@]}")
perl -pe "s|<!--SCRIPTS-->|${scripts:8:$((${#scripts}-10))}|s" "$SRCDIR/safari/Info.plist" \
| perl -000 -p -e 's|(<key>(?:CFBundleShortVersionString\|CFBundleVersion)</key>\s*)<string>[^<]*</string>|$1<string>'"$VERSION"'</string>|sg' \
> "$BUILD_DIR/safari.safariextension/Info.plist"

echo "done"

# Build Chrome extension
if [ -e "$CHROME_CERTIFICATE" -a -e "$CHROME_EXECUTABLE" ]; then
	echo -n "Building Chrome extension..."
	if "$CHROME_EXECUTABLE" --pack-extension="$BUILD_DIR/chrome" --pack-extension-key="$CHROME_CERTIFICATE" >> "$LOG" 2>&1
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
	
	# Minify if not in debug mode
	if [ ! -z $DEBUG ]; then
		mv "$tmpScript" "$builtScript"
		mv "$ieTmpScript" "$ieBuiltScript"
	else
		minify "$tmpScript" "$builtScript"
		minify "$ieTmpScript" "$ieBuiltScript"
		rm "$tmpScript" "$ieTmpScript"
	fi
done

# Copy/minify auxiliary JS
	if [ ! -z $DEBUG ]; then
	cp "${BOOKMARKLET_AUXILIARY_JS[@]}" "$BUILD_DIR/bookmarklet"
else	
	for scpt in "${BOOKMARKLET_AUXILIARY_JS[@]}"
	do
		minify "$scpt" "$BUILD_DIR/bookmarklet/`basename \"$scpt\"`"
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