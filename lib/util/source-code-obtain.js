/**
 * @fileoverview Tools for obtaining SourceCode objects.
 * @author Ian VanSchooten
 * @copyright 2015 Ian VanSchooten. All rights reserved.
 * See LICENSE in root directory for full license.
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var assign = require("object-assign"),
    CLIEngine = require("../cli-engine"),
    eslint = require("../eslint"),
    globUtil = require("./glob-util");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Get the SourceCode object for a single file
 * @param   {string}     filename The fully resolved filename to get SourceCode from.
 * @param   {Object}     options  A CLIEngine options object.
 * @returns {SourceCode}          The SourceCode object representing the file.
 */
function getSourceCodeOfFile(filename, options) {
    var opts = assign({}, options, { rules: [] });
    var cli = new CLIEngine(opts);

    cli.executeOnFiles([filename]);
    return eslint.getSourceCode();
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Gets the SourceCode of a single file, or set of files.
 * @param   {string[]|string} patterns A filename, directory name, or glob,
 *                                     or an array of them
 * @param   {Object} options           A CLIEngine options object.
 * @returns {Object}                   The SourceCode of all processed files.
 */
function getSourceCodeOfFiles(patterns, options) {
    var sourceCodes = {};

    if (typeof patterns === "string") {
        patterns = [patterns];
    }
    patterns = globUtil.resolveFileGlobPatterns(patterns, options.extensions);
    globUtil.listFilesToProcess(patterns, options).forEach(function(filename) {
        var sourceCode = getSourceCodeOfFile(filename, options);
        if (sourceCode) {
            sourceCodes[filename] = sourceCode;
        }
    });

    return sourceCodes;
}

module.exports = {
    getSourceCodeOfFiles: getSourceCodeOfFiles
};
