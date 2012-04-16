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

function explorerify {
	FROM="$1"
	TO="$2"
	
	# const -> var
	perl -pe "s/\bconst /var /" "$FROM" > "$TO"
	
	# a.indexOf(b) -> indexOf(a,b)
	perl -000 -pi -e 's/((?:[\w.]+|\[[^\]]*\])+)\.indexOf(\((((?>[^()]+)|(?2))*)\))/indexOf($1, $3)/gs' \
		"$TO"
}

CWD="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
. "$CWD/config.sh"

EXTENSIONDIR="$CWD/modules/zotero"
SAFARIDIR="$CWD/safari/Zotero Connector for Safari.safariextension"
CHROMEDIR="$CWD/chrome"
COMMONDIR="$CWD/common"
BOOKMARKLETDIR="$CWD/bookmarklet"

SKINDIR="$EXTENSIONDIR/chrome/skin/default/zotero"
XPCOMDIR="$EXTENSIONDIR/chrome/content/zotero/xpcom"
ICONS="$SKINDIR/treeitem*png $SKINDIR/treesource-collection.png $SKINDIR/zotero-z-16px.png"
IMAGES="$SKINDIR/progress_arcs.png $SKINDIR/cross.png"
PREFS_IMAGES="$SKINDIR/prefs-general.png $SKINDIR/prefs-advanced.png"

# Scripts to be included in inject scripts
INJECT_INCLUDE=('zotero.js' \
	'zotero_config.js' \
	'zotero/cachedTypes.js' \
	'zotero/date.js' \
	'zotero/debug.js' \
	'zotero/inject/http.js' \
	'zotero/inject/progressWindow.js' \
	'zotero/inject/translator.js' \
	'zotero/openurl.js' \
	'zotero/rdf/uri.js' \
	'zotero/rdf/term.js' \
	'zotero/rdf/identity.js' \
	'zotero/rdf/match.js' \
	'zotero/rdf/rdfparser.js' \
	'zotero/rdf.js' \
	'zotero/translate.js' \
	'zotero/translate_item.js' \
	'zotero/inject/translate_inject.js'\
	'zotero/utilities.js' \
	'zotero/utilities_translate.js' \
	'zotero/messages.js' \
	'messaging_inject.js')
if [ "$1" == "debug" ]; then
	INJECT_INCLUDE=("${INJECT_INCLUDE[@]}" \
		'tools/testTranslators/translatorTester_messages.js' \
		'tools/testTranslators/translatorTester.js' \
		'zotero/inject/inject.js' \
		'tools/testTranslators/translatorTester_inject.js')
else
	INJECT_INCLUDE=("${INJECT_INCLUDE[@]}" \
	'zotero/inject/inject.js')
fi

# Scripts to be included in background page
GLOBAL_INCLUDE=('zotero.js' \
	'zotero_config.js' \
	'zotero/connector.js' \
	'zotero/cachedTypes.js' \
	'zotero/date.js' \
	'zotero/debug.js' \
	'zotero/errors_webkit.js' \
	'zotero/oauth.js' \
	'zotero/oauthsimple.js' \
	'zotero/openurl.js' \
	'zotero/http.js' \
	'zotero/repo.js' \
	'zotero/tlds.js' \
	'zotero/translator.js' \
	'zotero/typeSchemaData.js' \
	'zotero/utilities.js' \
	'zotero/messages.js' \
	'zotero/messaging.js')
if [ "$1" == "debug" ]; then
	GLOBAL_INCLUDE=("${GLOBAL_INCLUDE[@]}" \
		'tools/testTranslators/translatorTester_messages.js' \
		'tools/testTranslators/translatorTester.js' \
		'tools/testTranslators/translatorTester_global.js')
fi

INJECT_BEGIN_CHROME='"js": \['
INJECT_END_CHROME='\t\t\t\],'
INJECT_BEGIN_SAFARI='<key>Scripts<\/key>\n\t\t<dict>\n\t\t\t<key>End<\/key>\n\t\t\t<array>'
INJECT_END_SAFARI='\t\t\t<\/array>'

GLOBAL_BEGIN='<!--BEGIN GLOBAL SCRIPTS-->'
GLOBAL_END='<!--END GLOBAL SCRIPTS-->'

# Scripts to be included in bookmarklet
BOOKMARKLET_INJECT_INCLUDE=("$XPCOMDIR/connector/cachedTypes.js" \
	"$XPCOMDIR/date.js" \
	"$COMMONDIR/zotero/inject/http.js" \
	"$XPCOMDIR/openurl.js" \
	"$COMMONDIR/zotero/inject/progressWindow.js" \
	"$XPCOMDIR/rdf/uri.js" \
	"$XPCOMDIR/rdf/term.js" \
	"$XPCOMDIR/rdf/identity.js" \
	"$XPCOMDIR/rdf/match.js" \
	"$XPCOMDIR/rdf/rdfparser.js" \
	"$XPCOMDIR/rdf.js" \
	"$XPCOMDIR/translation/translate.js" \
	"$XPCOMDIR/connector/translate_item.js" \
	"$COMMONDIR/zotero/inject/translate_inject.js" \
	"$COMMONDIR/zotero/inject/translator.js" \
	"$XPCOMDIR/connector/typeSchemaData.js" \
	"$XPCOMDIR/utilities_translate.js" \
	"$BOOKMARKLETDIR/messaging_inject.js" \
	"$BOOKMARKLETDIR/inject_base.js")

BOOKMARKLET_IFRAME_INCLUDE=("$XPCOMDIR/connector/connector.js" \
	"$XPCOMDIR/translation/tlds.js" \
	"$BOOKMARKLETDIR/translator.js" \
	"$COMMONDIR/zotero/messaging.js" \
	"$BOOKMARKLETDIR/iframe_base.js")

BOOKMARKLET_COMMON_INCLUDE=("$COMMONDIR/zotero.js" \
	"$BOOKMARKLETDIR/zotero_config.js" \
	"$XPCOMDIR/debug.js" \
	"$COMMONDIR/zotero/errors_webkit.js" \
	"$COMMONDIR/zotero/http.js" \
	"$XPCOMDIR/utilities.js" \
	"$BOOKMARKLETDIR/messages.js")

BOOKMARKLET_INJECT_TEST_INCLUDE=( \
	"$EXTENSIONDIR/chrome/content/zotero/tools/testTranslators/translatorTester.js" \
	"$BOOKMARKLETDIR/translator.js" \
	"$BOOKMARKLETDIR/test.js")
	
BOOKMARKLET_AUXILIARY_JS=( \
	"$BOOKMARKLETDIR/itemSelector_browserSpecific.js" \
	"$BOOKMARKLETDIR/upload.js" )

# Make alpha images for Safari
rm -rf "$SAFARIDIR/images/itemTypes" "$SAFARIDIR/images/toolbar"
mkdir "$SAFARIDIR/images/itemTypes"
mkdir "$SAFARIDIR/images/toolbar"
convert -version > /dev/null 2>&1
if [ $? == 0 ]; then
	cp $ICONS "$SAFARIDIR/images/itemTypes"
	cp $IMAGES $PREFS_IMAGES "$SAFARIDIR/images"
	for f in $ICONS
	do
		convert $f -background white -flatten -negate -alpha Background -alpha Copy -channel \
				Opacity -contrast-stretch 50 "$SAFARIDIR/images/toolbar/"`basename $f`
	done
else
	echo "ImageMagick not installed; not creating monochrome Safari icons"
	cp $ICONS "$SAFARIDIR/images/itemTypes"
	cp $ICONS "$SAFARIDIR/images/toolbar"
	cp $IMAGES $PREFS_IMAGES "$SAFARIDIR/images"
fi

# Copy images for Chrome
rm -rf "$CHROMEDIR/images"
mkdir "$CHROMEDIR/images"
cp $ICONS $IMAGES $PREFS_IMAGES "$CHROMEDIR/images"

# Update Chrome manifest.json
scripts=$(printf '\\t\\t\\t\\t"%s",\\n' "${INJECT_INCLUDE[@]}")
escapedScripts=$(echo "${scripts:0:$((${#scripts}-3))}" | sed -e 's/\//\\\//g')
perl -000 -pi -e "s/$INJECT_BEGIN_CHROME.*?$INJECT_END_CHROME/$INJECT_BEGIN_CHROME\\n$escapedScripts\\n$INJECT_END_CHROME/s" "$CHROMEDIR/manifest.json"

# Update Safari Info.plist
scripts=$(printf '\\t\\t\\t\\t<string>%s</string>\\n' "${INJECT_INCLUDE[@]}")
escapedScripts=$(echo "$scripts" | sed -e 's/\//\\\//g')
perl -000 -pi -e "s/$INJECT_BEGIN_SAFARI.*?$INJECT_END_SAFARI/$INJECT_BEGIN_SAFARI\\n$escapedScripts$INJECT_END_SAFARI/s" "$SAFARIDIR/Info.plist"

scripts=$(printf '<script type="text/javascript" src="%s"></script>\\n' "${GLOBAL_INCLUDE[@]}")
escapedScripts=$(echo "$scripts" | sed -e 's/\//\\\//g')

# Copy translation-related resources for Chrome/Safari
for dir in "$CHROMEDIR" "$SAFARIDIR"; do
	# Update global scripts
	perl -000 -pi -e "s/$GLOBAL_BEGIN.*$GLOBAL_END/$GLOBAL_BEGIN\\n$escapedScripts$GLOBAL_END/s" "$dir/global.html"
	
	# Copy files
	rm -rf "$dir/zotero" "$dir/tools" "$dir/preferences"
	cd "$COMMONDIR"
	find . -not \( -name ".?*" -prune \) -not -name "." -type d -exec mkdir "$dir/"{} \;
	find . -not \( -name ".?*" -prune \) -type f -exec cp -r {} "$dir/"{} \;
	cd "$CWD"

	if [ "$1" == "debug" ]; then
		perl -000 -pi -e 's/<!--BEGIN DEBUG(\s.*?\s)END DEBUG-->/<!--BEGIN DEBUG-->$1<!--END DEBUG-->/sg' "$dir/preferences/preferences.html"
	else
		perl -000 -pi -e 's/<!--BEGIN DEBUG-->(.*?)<!--END DEBUG-->//sg' "$dir/preferences/preferences.html"
	fi
	
	cp -r "$XPCOMDIR/utilities.js" \
	   "$XPCOMDIR/utilities_translate.js" \
	   "$XPCOMDIR/date.js" \
	   "$XPCOMDIR/debug.js" \
	   "$XPCOMDIR/openurl.js" \
	   "$XPCOMDIR/rdf.js" \
	   "$XPCOMDIR/rdf" \
	   "$XPCOMDIR/translation/translate.js" \
	   "$XPCOMDIR/translation/tlds.js" \
	   "$dir/zotero"
	
	if [ "$1" == "debug" ]; then
		cp "$EXTENSIONDIR/chrome/content/zotero/tools/testTranslators"/*.js "$EXTENSIONDIR/chrome/content/zotero/tools/testTranslators"/*.css "$dir/tools/testTranslators"
	else
		rm -rf "$dir/tools"
	fi
	
	cd "$XPCOMDIR/connector"
	find . -not \( -name ".?*" -prune \) -not -name "." -type d -exec mkdir "$dir/zotero/"{} \;
	find . -not \( -name ".?*" -prune \) -type f -exec cp -r {} "$dir/zotero/"{} \;
	cd "$CWD"
done

# Build Chrome extension
if [ -e "$CHROME_CERTIFICATE" -a -e "$CHROME_EXECUTABLE" ]; then
	"$CHROME_EXECUTABLE" --pack-extension="$CHROMEDIR" --pack-extension-key="$CHROME_CERTIFICATE" \
		> /dev/null
else
	echo "No Chrome certificate found; not building Chrome extension"
fi

# Build Safari extension
if [ -e "$SAFARI_PRIVATE_KEY" -a -e "$XAR_EXECUTABLE" ]; then
	SAFARI_EXT="$CWD/Zotero_Connector.safariextz"
	
	# Make a temporary directory
	TMP_BUILD_DIR="/tmp/zotero-connector-safari-build"
	rm -rf "$TMP_BUILD_DIR"
	mkdir "$TMP_BUILD_DIR"
	
	# Get size of signature
	SIGSIZE=`: | openssl dgst -sign "$SAFARI_PRIVATE_KEY" -binary | wc -c`
	
	# Make XAR
	pushd "$CWD/safari" > /dev/null
	xar -cf "$SAFARI_EXT" --distribution "`basename \"$SAFARIDIR\"`"
	popd "$CWD/safari" > /dev/null
	
	# Convert pem certificate to der
	openssl x509 -outform der -in "$SAFARI_PRIVATE_KEY" -out "$TMP_BUILD_DIR/safari_key.der"
	# Make signature data
	"$XAR_EXECUTABLE" --sign -f "$CWD/Zotero_Connector.safariextz" \
		--data-to-sign "$TMP_BUILD_DIR/safari_sha1.dat"  --sig-size $SIGSIZE \
		--cert-loc="$TMP_BUILD_DIR/safari_key.der" --cert-loc="$SAFARI_AUX_CERTIFICATE1" \
		--cert-loc="$SAFARI_AUX_CERTIFICATE2" > /dev/null
	# Delete converted signature
	rm -P "$TMP_BUILD_DIR/safari_key.der"
	# Sign signature data
	(echo "3021300906052B0E03021A05000414" | xxd -r -p; cat "$TMP_BUILD_DIR/safari_sha1.dat") \
		| openssl rsautl -sign -inkey "$SAFARI_PRIVATE_KEY" > "$TMP_BUILD_DIR/signature.dat"
	# Inject signature
	"$XAR_EXECUTABLE" --inject-sig "$TMP_BUILD_DIR/signature.dat" -f "$SAFARI_EXT" > /dev/null
else
	echo "No Safari certificate found; not building Safari extension"
fi


# Make bookmarklet
rm -rf "$BOOKMARKLETDIR/dist"
mkdir "$BOOKMARKLETDIR/dist"

for scpt in "iframe" "common" "inject"
do
	tmpScript="$BOOKMARKLETDIR/dist/${scpt}_tmp.js"
	
	if [ "$scpt" == "iframe" ]; then
		files=("${BOOKMARKLET_IFRAME_INCLUDE[@]}")
	elif [ "$scpt" == "common" ]; then
		files=("${BOOKMARKLET_COMMON_INCLUDE[@]}")
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

	tmpScript="$BOOKMARKLETDIR/dist/${scpt}_tmp.js"
	builtScript="$BOOKMARKLETDIR/dist/${scpt}.js"
	ieTmpScript="$BOOKMARKLETDIR/dist/${scpt}_ie_tmp.js"
	ieBuiltScript="$BOOKMARKLETDIR/dist/${scpt}_ie.js"
	
	if [ "$scpt" == "inject" ]; then
		if [ "$1" == "debug" ]; then
			# Make test scripts
			testScript="$BOOKMARKLETDIR/tests/inject_test.js"
			ieTestScript="$BOOKMARKLETDIR/tests/inject_ie_test.js"
			
			# Make inject_test.js
			cat "$BOOKMARKLETDIR/dist/common.js" "$tmpScript" > "$testScript"
			for f in "${BOOKMARKLET_INJECT_TEST_INCLUDE[@]}"
			do
				echo "/******** BEGIN `basename $f` ********/"
				LC_CTYPE=C tr -d '\r' < $f
				echo ""
				echo "/******** END `basename $f` ********/"
			done >> "$testScript"
			
			# Make inject_ie_test.js
			explorerify "$testScript" "$ieBuiltScript"
			cat "$BOOKMARKLETDIR/ie_compat.js" "$ieBuiltScript" "$BOOKMARKLETDIR/inject_ie_compat.js" > "$ieTestScript"
			rm "$ieBuiltScript"
		fi
	fi
	
	
	explorerify "$tmpScript" "$ieTmpScript"
	if [ "$scpt" == "common" ]; then
		cp "$ieTmpScript" "$ieBuiltScript"
		cat "$BOOKMARKLETDIR/ie_compat.js" "$ieBuiltScript" > "$ieTmpScript"
		rm "$ieBuiltScript"
	fi
	
	# Minify if not in debug mode
	if [ "$1" == "debug" ]; then
		mv "$tmpScript" "$builtScript"
		mv "$ieTmpScript" "$ieBuiltScript"
	else
		uglifyjs "$tmpScript" > "$builtScript"
		uglifyjs "$ieTmpScript" > "$ieBuiltScript"
		rm "$tmpScript" "$ieTmpScript"
	fi
	
	if [ "$scpt" == "inject" ]; then
		# Currently this part can't be minified
		cat "$BOOKMARKLETDIR/inject_ie_compat.js" >> "$ieBuiltScript";
	fi
done


cat "$BOOKMARKLETDIR/ie_compat.js" "$BOOKMARKLETDIR/ie_hack.js" > "$BOOKMARKLETDIR/dist/ie_compat_tmp.js"

# Copy/uglify auxiliary JS
if [ "$1" == "debug" ]; then
	mv "$BOOKMARKLETDIR/dist/ie_compat_tmp.js" "$BOOKMARKLETDIR/dist/ie_compat.js"
	cp "${BOOKMARKLET_AUXILIARY_JS[@]}" "$BOOKMARKLETDIR/debug_mode.html" "$BOOKMARKLETDIR/dist"
else		
	uglifyjs "$BOOKMARKLETDIR/dist/ie_compat_tmp.js" > "$BOOKMARKLETDIR/dist/ie_compat.js"
	rm "$BOOKMARKLETDIR/dist/ie_compat.js"
	
	for scpt in "${BOOKMARKLET_AUXILIARY_JS[@]}"
	do
		uglifyjs "$scpt" > "$BOOKMARKLETDIR/dist/`basename \"$scpt\"`"
	done
fi

# Bookmarklet itself
echo -n '<p><a href="javascript:' > "$BOOKMARKLETDIR/dist/bookmarklet.html"
echo -n "`uglifyjs \"$BOOKMARKLETDIR/bookmarklet.js\" | sed 's/&/\&amp;/g' | sed 's/\"/\&quot;/g'`" >> "$BOOKMARKLETDIR/dist/bookmarklet.html"
echo -n '">Save to Zotero</a></p>' >> "$BOOKMARKLETDIR/dist/bookmarklet.html"
echo -n '<p><textarea>' >> "$BOOKMARKLETDIR/dist/bookmarklet.html"
echo -n "javascript:`uglifyjs \"$BOOKMARKLETDIR/bookmarklet.js\" | sed 's/&/\&amp;/g' | sed 's/\"/\&quot;/g' | sed 's/</\&lt;/g' | sed 's/>/\&gt;/g'`" >> "$BOOKMARKLETDIR/dist/bookmarklet.html"
echo -n '</textarea></p>' >> "$BOOKMARKLETDIR/dist/bookmarklet.html"

# Copy to dist directory
cp "$BOOKMARKLETDIR/iframe.html" \
	"$BOOKMARKLETDIR/iframe_ie.html" \
	"$BOOKMARKLETDIR/auth_complete.html" \
	"$COMMONDIR/itemSelector"*\
	"$BOOKMARKLETDIR/dist"
cp "$BOOKMARKLETDIR/htaccess" "$BOOKMARKLETDIR/dist/.htaccess"
mkdir "$BOOKMARKLETDIR/dist/images"
cp $ICONS $IMAGES "$BOOKMARKLETDIR/dist/images"