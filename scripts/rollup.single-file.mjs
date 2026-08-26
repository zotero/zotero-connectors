import path from "node:path";
import { fileURLToPath } from "node:url";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.env.SINGLE_FILE_OUTPUT_DIR
	? path.resolve(process.env.SINGLE_FILE_OUTPUT_DIR)
	: path.join(rootDir, "lib", "SingleFile");
const plugins = [resolve({ moduleDirectories: ["node_modules"] })];
const external = ["single-file-core"];

export default [
	{
		input: "single-file-core/single-file.js",
		output: {
			file: path.join(outputDir, "single-file.js"),
			format: "umd",
			name: "singlefile",
			plugins: [terser()]
		},
		plugins,
		external
	},
	{
		input: "single-file-core/single-file-bootstrap.js",
		output: {
			file: path.join(outputDir, "single-file-bootstrap.js"),
			format: "umd",
			name: "singlefileBootstrap",
			plugins: [terser()]
		},
		plugins,
		external
	},
	{
		input: "single-file-core/single-file-hooks-frames.js",
		output: {
			file: path.join(outputDir, "single-file-hooks-frames.js"),
			format: "iife",
			plugins: [terser({
				mangle: {
					keep_fnames: true
				}
			})]
		},
		plugins,
		external
	}
];
