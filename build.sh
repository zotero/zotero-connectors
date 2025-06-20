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

function usage {
	cat >&2 <<DONE
Usage: $0 [-p PLATFORMS] [-v VERSION] [-d]
Options
 -p PLATFORMS        platform(s) (b=browserExt, s=safari; defaults to all)
 -v VERSION          use version VERSION
 -d                  build for debugging (enable translator tester, don't minify)
DONE
	exit 1
}

BUILD_BROWSER_EXT=0
BUILD_SAFARI=0
while getopts "hp:v:d" opt; do
	case $opt in
		h)
			usage
			;;
		p)
			for i in `seq 0 1 $((${#OPTARG}-1))`
			do
				case ${OPTARG:i:1} in
					b) BUILD_BROWSER_EXT=1;;
					s) BUILD_SAFARI=1;;
					*)
						echo "$0: Invalid platform option ${OPTARG:i:1}"
						usage
						;;
				esac
			done
			;;
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

if [[ ! -z "$TEST_CHROME" ]] || [[ ! -z "$TEST_FX" ]]; then
	BUILD_BROWSER_EXT=1
elif [[ ! -z $TEST_SAFARI ]]; then
	BUILD_SAFARI=1
# Default to all builds if none specified
elif [[ $BUILD_BROWSER_EXT -eq 0 ]] && [[ $BUILD_SAFARI -eq 0 ]]; then
	BUILD_BROWSER_EXT=1
	BUILD_SAFARI=1
fi

if [ -z $VERSION ]; then
	VERSION="4.999.0"
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
LIBDIR="$CWD/lib"
NODE_MODULES_DIR="$CWD/node_modules"
LOG="$CWD/build.log"

EXTENSION_TRANSLATE_DIR="$SRCDIR/translate"
EXTENSION_UTILITIES_DIR="$SRCDIR/utilities"
EXTENSION_SKIN_DIR="$SRCDIR/zotero/chrome/skin/default/zotero"

SAFARI_EXT="$DISTDIR/Zotero_Connector-$VERSION.safariextz"

ICONS="$EXTENSION_SKIN_DIR/treeitem*png $EXTENSION_SKIN_DIR/treesource-collection.png $EXTENSION_SKIN_DIR/zotero-new-z-16px.png  \
    $SRCDIR/common/images/*"
IMAGES="$EXTENSION_SKIN_DIR/progress_arcs.png \
	$EXTENSION_SKIN_DIR/cross.png \
	$EXTENSION_SKIN_DIR/tick.png $EXTENSION_SKIN_DIR/tick@2x.png \
	$EXTENSION_SKIN_DIR/spinner-16px.png $EXTENSION_SKIN_DIR/spinner-16px@2x.png \
	$EXTENSION_SKIN_DIR/treesource-library.png"
PREFS_IMAGES="$EXTENSION_SKIN_DIR/prefs-general.png $EXTENSION_SKIN_DIR/prefs-advanced.png $EXTENSION_SKIN_DIR/prefs-proxies.png"

LIBS=()
	
if [[ ! -z $DEBUG ]]; then
	LIBS=("${LIBS[@]}" \
		"$NODE_MODULES_DIR/bluebird/js/browser/bluebird.js" \
		"$NODE_MODULES_DIR/chai/chai.js" \
		"$NODE_MODULES_DIR/mocha/mocha.js" \
		"$NODE_MODULES_DIR/mocha/mocha.css" \
		"$NODE_MODULES_DIR/sinon/pkg/sinon.js")
fi


# Remove log file
rm -f "$LOG"

# Remove old build directories
# TODO: Remove 'chrome' line
rm -rf "$BUILD_DIR/browserExt" \
	"$BUILD_DIR/chrome" \
	"$BUILD_DIR/manifestv3" \
	"$BUILD_DIR/firefox" \
	"$BUILD_DIR/safari" \
	"$BUILD_DIR/bookmarklet"

# Make directories if they don't exist
for dir in "$DISTDIR" \
	"$BUILD_DIR/safari" \
	"$BUILD_DIR/browserExt"; do
	if [ ! -d "$dir" ]; then
		mkdir "$dir"
	fi
done

echo -n "Building connectors..."

function copyResources {
	browser="$1"
	if [ "$browser" == "safari" ]; then
		browser_builddir="$BUILD_DIR/safari"
	else
		browser_builddir="$BUILD_DIR/$browser"
	fi
	browser_srcdir="$SRCDIR/$browser"
	
	cp COPYING "$browser_builddir/"
	
	# Copy common files
	rsync -r --exclude '.*' "$SRCDIR/common/" "$browser_builddir/"
	
	# Copy browser-specific files
	rsync -r --exclude '.*' --exclude ui/tree "$browser_srcdir/" "$browser_builddir/"
	
	# Set version
	perl -pi -e 's/^(\s*this.version\s*=\s*)"[^"]*"/$1"'"$VERSION"'"/' "$browser_builddir/zotero.js"
	
	# Copy translation pieces
	cp -r "$EXTENSION_TRANSLATE_DIR/src" "$browser_builddir/translate"
	cp -r "$EXTENSION_UTILITIES_DIR" "$browser_builddir/utilities"
	
	# Make sure an empty browser-polyfill.js exists in Safari, since it's included in iframe
	# HTML pages
	if [ "$browser" = "safari" ]; then
		echo ';' > "$browser_builddir/browser-polyfill.js"
	fi
	
	# Copy google docs integration code
	cp -r "$SRCDIR/zotero-google-docs-integration/src/connector" \
		 "$browser_builddir/zotero-google-docs-integration"
	cp -r "$SRCDIR/zotero-google-docs-integration/package.json" \
		 "$browser_builddir/zotero-google-docs-integration"
		 
	# Copy locales
	mkdir -p "$browser_builddir/_locales/en"
	# Get English strings from this repo
	cp "$SRCDIR/messages.json" "$browser_builddir/_locales/en"
	# And other locales from the Zotero submodule
	pushd "$SRCDIR/zotero/chrome/locale" > /dev/null
	for code in ?? ??-??; do
		if [ $code = 'en-US' ]; then
			continue
		fi
		
		lang=${code:0:2}
		# Keep in sync with i18n.js in Safari connector
		if [[ $code = 'pt-PT' ]] || [[ $code = 'zh-TW' ]]; then
			target_dir="$browser_builddir/_locales/$code"
			
		else
			target_dir="$browser_builddir/_locales/$lang"
		fi
		
		if [ -f $code/zotero/connector.json ]; then
			mkdir -p $target_dir
			cp $code/zotero/connector.json "$target_dir/messages.json"
		fi
	done
	popd > /dev/null
	
	# Copy node_modules libs
	mkdir "$browser_builddir/lib"
	
	if [ ${#LIBS[@]} -gt 0 ]; then
		cp "${LIBS[@]}" "$browser_builddir/lib"
	fi
	# TODO: Allow renaming to be specified in library list above
	cp "$NODE_MODULES_DIR/react/umd/react.production.min.js" "$browser_builddir/lib/react.js"
	cp "$NODE_MODULES_DIR/react-dom/umd/react-dom.production.min.js" "$browser_builddir/lib/react-dom.js"
	cp "$NODE_MODULES_DIR/prop-types/prop-types.min.js" "$browser_builddir/lib/prop-types.js"
	cp "$NODE_MODULES_DIR/dompurify/dist/purify.min.js" "$browser_builddir/lib/dompurify.js"
	cp "$NODE_MODULES_DIR/react-dom-factories/index.js" "$browser_builddir/lib/react-dom-factories.js"
	
	# Remove .jsx files - we'll deal with those in gulp
	find "$browser_builddir" -type f -name "*.jsx" -delete
	
	# Delete other non-deployed files
	find "$browser_builddir" -type f -name ".git*" -delete
	rm -rf "$browser_builddir/utilities/.github"
	rm -rf "$browser_builddir/utilities/test"
	for i in 'package.json' 'package-lock.json' 'COPYING' 'README.md' 'resource/README.md' 'resource/schema/'; do
		rm -r "$browser_builddir/utilities/$i"
	done
	
	# Copy SingleFile submodule code
	mkdir -p "$browser_builddir/lib/SingleFile/lib"
	cp -r "$LIBDIR/SingleFile-Lite/lib/single-file-bootstrap.js" \
	  "$LIBDIR/SingleFile-Lite/lib/single-file-hooks-frames.js" \
	  "$LIBDIR/SingleFile-Lite/lib/single-file.js" \
		"$browser_builddir/lib/SingleFile"
	# Copy SingleFile config object from client code
	cp "$SRCDIR/zotero/chrome/content/zotero/xpcom/singlefile.js" "$browser_builddir/singlefile-config.js"
	
	if [ ! -z $DEBUG ]; then
		cp "$EXTENSION_TRANSLATE_DIR/testTranslators/"*.mjs "$browser_builddir/tools/testTranslators"
	else
		rm -rf "$browser_builddir/tools"
	fi
}

if [[ $BUILD_BROWSER_EXT == 1 ]]; then
	# Copy images for Chrome
	rm -rf "$BUILD_DIR/browserExt/images"
	mkdir "$BUILD_DIR/browserExt/images"
	cp $ICONS $IMAGES $PREFS_IMAGES "$BUILD_DIR/browserExt/images"
	cp "$CWD/icons/Icon-16.png" "$CWD/icons/Icon-48.png" "$CWD/icons/Icon-96.png" "$CWD/icons/Icon-128.png" "$BUILD_DIR/browserExt"
	
	copyResources 'browserExt'
fi

if [[ $BUILD_SAFARI == 1 ]]; then
	#
	# Make alpha images
	#
	# ImageMagick 7 changes how channels work, so the same command doesn't work properly. Until we
	# figure out an equivalent command for ImageMagick 7, continue using version 6 from homebrew.
	IMAGEMAGICK_CONVERT=/usr/local/opt/imagemagick@6/bin/convert
	rm -rf "$BUILD_DIR/safari/images"
	mkdir "$BUILD_DIR/safari/images"
	mkdir "$BUILD_DIR/safari/images/toolbar"
	set +e
	$IMAGEMAGICK_CONVERT -version | grep "ImageMagick 6" > /dev/null 2>&1
	RETVAL=$?
	set -e
	if [ $RETVAL == 0 ]; then
		cp $ICONS $IMAGES $PREFS_IMAGES "$BUILD_DIR/safari/images"
		for f in $ICONS
		do
			$IMAGEMAGICK_CONVERT $f -grayscale Rec709Luminance "$BUILD_DIR/safari/images/toolbar/"`basename $f`
		done
	else
		echo
		echo "ImageMagick 6 not installed; not creating monochrome Safari icons"
		cp $ICONS "$BUILD_DIR/safari/images"
		cp $ICONS "$BUILD_DIR/safari/images/toolbar"
		cp $IMAGES $PREFS_IMAGES "$BUILD_DIR/safari/images"
	fi
	cp "$CWD/icons/Icon-32.png" "$CWD/icons/Icon-48.png" "$CWD/icons/Icon-64.png" \
		"$BUILD_DIR/safari"
	
	copyResources 'safari'
fi

# Make separate Manifest v3 and Firefox directories
if [[ $BUILD_BROWSER_EXT == 1 ]]; then
	rsync -a $BUILD_DIR/browserExt/ $BUILD_DIR/manifestv3/
	mv $BUILD_DIR/browserExt $BUILD_DIR/firefox
fi

if [[ $BUILD_BROWSER_EXT == 1 ]] || [[ $BUILD_SAFARI == 1 ]]; then
	npx gulp -v >/dev/null 2>&1 || { echo >&2 "gulp not found -- aborting"; exit 1; }

	# Update scripts
	if [ ! -z $DEBUG ]; then
		npx gulp process-custom-scripts --connector-version "$VERSION" > "$LOG" 2>&1
	else
		npx gulp process-custom-scripts --connector-version "$VERSION" -p > "$LOG" 2>&1
	fi
fi

if [[ $BUILD_BROWSER_EXT == 1 ]]; then
	# Remove MV3 manifest file
	rm "$BUILD_DIR/manifestv3/manifest-v3.json"
	rm "$BUILD_DIR/firefox/manifest-v3.json"
	
	# Chrome modifications
	
	# Use larger icons where available in Chrome, which actually wants 19px icons
	# 2x
	for img in "$BUILD_DIR"/manifestv3/images/*2x.png; do
		cp $img `echo $img | sed 's/@2x//'`
	done
	## 2.5x
	for img in "$BUILD_DIR"/manifestv3/images/*48px.png; do
		cp $img `echo $img | sed 's/@48px//'`
	done
	
	# Remove the 'applications' property used by Firefox from the manifest
	pushd $BUILD_DIR/manifestv3 > /dev/null
	cat manifest.json | jq '. |= del(.applications)' > manifest.json-tmp
	mv manifest.json-tmp manifest.json
	popd > /dev/null
	
	# Firefox modifications
	
	# TEMP: Copy 2x icons to 1x until getImageSrc() is updated to detect HiDPI
	for img in "$BUILD_DIR"/firefox/images/*2x.png; do
		cp $img `echo $img | sed 's/@2x//'`
	done
	## 2.5x
	for img in "$BUILD_DIR"/firefox/images/*48px.png; do
		cp $img `echo $img | sed 's/@48px//'`
	done

fi

# TODO: Would be better to skip these in gulpfile.js for non-debug builds and remove them in
# copyResources instead
if [ -z $DEBUG ]; then
	rm -rf "$BUILD_DIR/manifestv3/test"
	rm -rf "$BUILD_DIR/firefox/test"
fi

echo "done"
