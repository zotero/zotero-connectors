CONFIG_PATH="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/config.sh"
if [ -f "$CONFIG_PATH" ]; then
	. "$CONFIG_PATH"
fi

if [ -z "${BUILD_DIR:-}" ]; then
	BUILD_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/dist"
	mkdir -p "$BUILD_DIR"
fi
