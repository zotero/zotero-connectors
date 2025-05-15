#!/bin/bash

# Determine script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

# Change to project root directory
cd "$PROJECT_ROOT" || exit 1

function usage {
	cat >&2 <<DONE
Usage: $0 [option] [TESTS...]
Options
 -i                 headless mode (CI)
 -c                 don't quit on completion
 -d 	              enable debug logging
 -f                 stop after first test failure
 -g                 only run tests matching the given pattern (grep)
 -h                 display this help
DONE
	exit 1
}

# Default values
MOCHA_ARGS=""
ENV_VARS=""
# c_FLAG is unused for now

# Parse options
while getopts "icdfg:h" opt; do
	case $opt in
		i)
			ENV_VARS+=" HEADLESS=true"
			;;
		c)
			ENV_VARS+=" NO_QUIT=true"
			;;
		d)
			ENV_VARS+=" DEBUG=true"
			;;
		f)
			MOCHA_ARGS+=" --bail"
			;;
		g)
			# Quote the pattern to handle spaces
			MOCHA_ARGS+=" --grep '$OPTARG'"
			;;
		h)
			usage
			;;
		\?)
			echo "Invalid option: -$OPTARG" >&2
			usage
			;;
		:)
			echo "Option -$OPTARG requires an argument." >&2
			usage
			;;
	esac
done
shift $((OPTIND-1))

# Append remaining arguments (test files/dirs)
REMAINING_ARGS=""
for arg in "$@"; do
	REMAINING_ARGS+=" \"$arg\""
done

# Construct the command
# Use 'eval' to correctly handle environment variables and quoted arguments
CMD="eval \"$ENV_VARS npm run test -- $MOCHA_ARGS $REMAINING_ARGS\""

echo "Executing: $CMD"

# Run tests
eval "$CMD"