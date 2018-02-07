module.exports = {
	output: {
		library: "Tree",
		libraryExport: "default"
	},
	externals: {
		react: "React",
		"react-dom-factories": "ReactDOMFactories",
		"prop-types": "PropTypes"
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: [
					{ loader: 'style-loader' },
					{ loader: 'css-loader' }
				]
			},
			{
				test: /\.svg$/,
				use: 'svg-inline-loader'
			}
		]
	}
}
