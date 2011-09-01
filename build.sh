#!/bin/bash

CWD=`pwd`
EXTENSIONDIR="$Z"
SAFARIDIR="$CWD/safari/Zotero Connector for Safari.safariextension"
CHROMEDIR="$CWD/chrome"
COMMONDIR="$CWD/common"
BOOKMARKLETDIR="$CWD/bookmarklet"

SKINDIR="$EXTENSIONDIR/chrome/skin/default/zotero"
XPCOMDIR="$EXTENSIONDIR/chrome/content/zotero/xpcom"
IMAGES="$SKINDIR/treeitem*png $SKINDIR/treesource-collection.png $SKINDIR/zotero-z-16px.png"
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
BOOKMARKLET_INJECT_INCLUDE=("$COMMONDIR/zotero.js" \
	"$BOOKMARKLETDIR/zotero_config.js" \
	"$XPCOMDIR/connector/cachedTypes.js" \
	"$XPCOMDIR/date.js" \
	"$XPCOMDIR/debug.js" \
	"$COMMONDIR/zotero/errors_webkit.js" \
	"$COMMONDIR/zotero/http.js" \
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
	"$XPCOMDIR/utilities.js" \
	"$XPCOMDIR/utilities_translate.js" \
	"$BOOKMARKLETDIR/messages.js" \
	"$BOOKMARKLETDIR/messaging_inject.js")

BOOKMARKLET_IFRAME_INCLUDE=("$COMMONDIR/zotero.js" \
	"$BOOKMARKLETDIR/zotero_config.js" \
	"$XPCOMDIR/connector/connector.js" \
	"$XPCOMDIR/debug.js" \
	"$COMMONDIR/zotero/errors_webkit.js" \
	"$COMMONDIR/zotero/http.js" \
	"$COMMONDIR/zotero/oauth.js" \
	"$COMMONDIR/zotero/oauthsimple.js" \
	"$XPCOMDIR/translation/tlds.js" \
	"$BOOKMARKLETDIR/translator.js" \
	"$XPCOMDIR/utilities.js" \
	"$BOOKMARKLETDIR/messages.js" \
	"$COMMONDIR/zotero/messaging.js")
	
# Make alpha images for Safari
rm -rf "$SAFARIDIR/images/itemTypes" "$SAFARIDIR/images/toolbar"
mkdir "$SAFARIDIR/images/itemTypes"
mkdir "$SAFARIDIR/images/toolbar"
cp $IMAGES "$SAFARIDIR/images/itemTypes"
cp $PREFS_IMAGES "$SAFARIDIR/images"
for f in $IMAGES
do
	convert $f -background white -flatten -negate -alpha Background -alpha Copy -channel \
			Opacity -contrast-stretch 50 "$SAFARIDIR/images/toolbar/"`basename $f`
done

# Copy images for Chrome
cp $IMAGES "$CHROMEDIR/images"
cp $PREFS_IMAGES "$CHROMEDIR/images"

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

rm -rf "$BOOKMARKLETDIR/dist"
mkdir "$BOOKMARKLETDIR/dist"
mkdir "$BOOKMARKLETDIR/dist/icons"

for scpt in "inject" "iframe"
do
	tmpScript="$BOOKMARKLETDIR/dist/${scpt}_tmp.js"
	
	if [ "$scpt" == "inject" ]; then
		files=("${BOOKMARKLET_INJECT_INCLUDE[@]}")
		echo "new function() { if(window.zoteroShowProgressWindow) return;" > "$tmpScript"
	else
		files=("${BOOKMARKLET_IFRAME_INCLUDE[@]}")
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
	
	# Bundle for IE
	tmpIEScript="$BOOKMARKLETDIR/dist/${scpt}_ie_tmp.js"
	
	# const -> var
	perl -pe "s/const/var/" "$tmpScript" > "$tmpIEScript"
	
	# a.indexOf(b) -> indexOf(a,b)
	perl -000 -pi -e 's/((?:[\w.]+|\[[^\]]*\])+)\.indexOf(\((((?>[^()]+)|(?2))*)\))/indexOf($1, $3)/gs' \
		"$tmpIEScript"
	
	# Add IE compat functions to IE inject script
	if [ "$scpt" == "inject" ]; then
		for f in "$BOOKMARKLETDIR/ie_compat.js" "$BOOKMARKLETDIR/${scpt}_ie_compat.js"
		do
			echo "/******** BEGIN `basename $f` ********/" >> "$tmpIEScript"
			LC_CTYPE=C tr -d '\r' < $f >> "$tmpIEScript"
			echo "" >> "$tmpIEScript"
			echo "/******** END `basename $f` ********/" >> "$tmpIEScript"
		done
	fi
	
	for platform in "" "_ie"
	do
		tmpScript="$BOOKMARKLETDIR/dist/${scpt}${platform}_tmp.js"
		builtScript="$BOOKMARKLETDIR/dist/${scpt}${platform}.js"
		
		# Bundle *_base.js
		echo "/******** BEGIN ${scpt}_base.js ********/" >> "$tmpScript"
		LC_CTYPE=C tr -d '\r' < "$BOOKMARKLETDIR/${scpt}_base.js" >> "$tmpScript"
		echo "" >> "$tmpScript"
		echo "/******** END ${scpt}_base.js ********/" >> "$tmpScript"
		
		# Minify if not in debug mode
		if [ "$1" == "debug" ]; then
			mv "$tmpScript" "$builtScript"
		else
			uglifyjs "$tmpScript" > "$builtScript"
			rm "$tmpScript"
		fi
	done
done

# IE compat library
if [ "$1" == "debug" ]; then
	cp "$BOOKMARKLETDIR/ie_compat.js" "$BOOKMARKLETDIR/dist/ie_compat.js"
else
	uglifyjs "$BOOKMARKLETDIR/ie_compat.js" > "$BOOKMARKLETDIR/dist/ie_compat.js"
fi

# Copy to dist directory
cp "$BOOKMARKLETDIR/iframe.html" \
	"$BOOKMARKLETDIR/iframe_ie.html" \
	"$BOOKMARKLETDIR/ie_hack.html" \
	"$BOOKMARKLETDIR/ie_hack.js" \
	"$BOOKMARKLETDIR/auth_complete.html" \
	"$BOOKMARKLETDIR/itemSelector_browserSpecific.js" \
	"$COMMONDIR/itemSelector"*\
	"$BOOKMARKLETDIR/dist"
cp $IMAGES "$BOOKMARKLETDIR/dist/icons"