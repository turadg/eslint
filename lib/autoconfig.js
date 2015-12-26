/**
 * @fileoverview Used for creating a suggested configuration based on project code.
 * @author Ian VanSchooten
 * @copyright 2015 Ian VanSchooten. All rights reserved.
 * See LICENSE in root directory for full license.
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

// var util = require("util");
var assign = require("object-assign"),
    debug = require("debug"),
    isEqual = require("lodash.isequal"),
    eslint = require("./eslint"),
    loadRules = require("./load-rules"),
    rules = require("./rules"),
    recConfig = require("../conf/eslint.json");

//------------------------------------------------------------------------------
// Data
//------------------------------------------------------------------------------

var MAX_CONFIG_COMBINATIONS = 17;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

debug = debug("eslint:autoconfig");

/**
 * Wrap all of the elements of an array into arrays.
 * @param   {*[]}     xs Any array.
 * @returns {Array[]}    An array of arrays.
 */
function explodeArray(xs) {
    return xs.reduce(function(accumulator, x) {
        accumulator.push([x]);
        return accumulator;
    }, []);
}

/**
 * Mix two arrays such that each element of the second array is concatenated
 * onto each element of the first array.
 *
 * For example:
 * combineArrays([a, [b, c]], [x, y]); // -> [[a, x], [a, y], [b, c, x], [b, c, y]]
 *
 * @param   {array} arr1 The first array to combine.
 * @param   {array} arr2 The second array to combine.
 * @returns {array}      A mixture of the elements of the first and second arrays.
 */
function combineArrays(arr1, arr2) {
    var res = [];
    if (arr1.length === 0) {
        return explodeArray(arr2);
    }
    if (arr2.length === 0) {
        return explodeArray(arr1);
    }
    arr1.forEach(function(x1) {
        arr2.forEach(function(x2) {
            res.push([].concat(x1, x2));
        });
    });
    return res;
}

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

/**
 * Configuration settings for a rule.
 *
 * A configuration can be a single number (severity), or an array where the first
 * element in the array is the severity, and is the only required element.
 * Configs may also have one or more additional elements to specify rule
 * configuration or options.
 *
 * @typedef {array|number} ruleConfig
 * @param {number}  0  The rule's severity (0, 1, 2).
 */

/**
 * Object whose keys are rule names and values are arrays of valid ruleConfig items
 * which should be linted against the target source code to determine error counts.
 * (a ruleConfigSet.ruleConfigs).
 *
 * e.g. rulesConfig = {
 *     "comma-dangle": [2, [2, "always"], [2, "always-multiline"], [2, "never"]],
 *     "no-console": [2]
 * }
 * @typedef rulesConfig
 */


/**
 * Information about a rule configuration, in the context of a Registry.
 *
 * @typedef {Object}     registryItem
 * @param   {ruleConfig} config        A valid configuration for the rule
 * @param   {number}     specificity   The number of elements in the ruleConfig array
 * @param   {number}     errorCount    The number of errors encountered when linting with the config
 */

 /**
  * This callback is used to measure execution status in a progress bar
  * @callback progressCallback
  * @param {number} The total number of times the callback will be called.
  */

/**
 * Group together valid rule configurations based on object properties
 *
 * e.g.:
 * groupByProperty([
 *     {before: true},
 *     {before: false},
 *     {after: true},
 *     {after: false}
 * ]);
 *
 * will return:
 * [
 *     [{before: true}, {before: false}],
 *     [{after: true}, {after: false}]
 * ]
 *
 * @param   {Object[]} objects Array of objects, each with one property/value pair
 * @returns {Array[]}          Array of arrays of objects grouped by property
 */
function groupByProperty(objects) {
    var groupedObj = objects.reduce(function(accumulator, obj) {
        var prop = Object.keys(obj)[0];
        accumulator[prop] = accumulator[prop] ? accumulator[prop].concat(obj) : [obj];
        return accumulator;
    }, {});
    return Object.keys(groupedObj).map(function(prop) {
        return groupedObj[prop];
    });
}

/**
 * Create valid rule configurations by combining two arrays,
 * with each array containing multiple objects each with a
 * single property/value pair and matching properties.
 *
 * e.g.:
 * combinePropertyObjects(
 *     [{before: true}, {before: false}],
 *     [{after: true}, {after: false}]
 * );
 *
 * will return:
 * [
 *     {before: true, after: true},
 *     {before: true, after: false},
 *     {before: false, after: true},
 *     {before: false, after: false}
 * ]
 *
 * @param   {Object[]} objArr1 Single key/value objects, all with the same key
 * @param   {Object[]} objArr2 Single key/value objects, all with another key
 * @returns {Object[]}         Combined objects for each combination of input properties and values
 */
function combinePropertyObjects(objArr1, objArr2) {
    var res = [];
    if (objArr1.length === 0) {
        return objArr2;
    }
    if (objArr2.length === 0) {
        return objArr1;
    }
    objArr1.forEach(function(obj1) {
        objArr2.forEach(function(obj2) {
            var combinedObj = {};
            var obj1Props = Object.keys(obj1);
            var obj2Props = Object.keys(obj2);
            obj1Props.forEach(function(prop1) {
                combinedObj[prop1] = obj1[prop1];
            });
            obj2Props.forEach(function(prop2) {
                combinedObj[prop2] = obj2[prop2];
            });
            res.push(combinedObj);
        });
    });
    return res;
}

/**
 * Create registryItems for rules
 * @param   {rulesConfig} rulesConfig Hash of rule names and arrays of ruleConfig items
 * @returns {Object}                  registryItems for each rule in provided rulesConfig
 */
function makeRegistryItems(rulesConfig) {
    return Object.keys(rulesConfig).reduce(function(accumulator, ruleId) {
        accumulator[ruleId] = rulesConfig[ruleId].map(function(config) {
            return {
                config: config,
                specificity: config.length || 1,
                errorCount: void 0
            };
        });
        return accumulator;
    }, {});
}

/**
 * Creates a new instance of a rule configuration set
 *
 * A rule configuration set is an array of configurations that are valid for a
 * given rule.  For example, the configuration set for the "semi" rule could be:
 *
 * ruleConfigSet.ruleConfigs // -> [[2], [2, "always"], [2, "never"]]
 *
 * @param {ruleConfig[]} configs Valid rule configurations
 * @constructor
 */
function RuleConfigSet(configs) {

    /**
     * Stored valid rule configurations for this instance
     * @type {array}
     */
    this.ruleConfigs = configs || [];

}

RuleConfigSet.prototype = {

    constructor: RuleConfigSet,

    /**
     * Add a severity level to the front of all configs in the instance.
     * This should only be called after all configs have been added to the instance.
     *
     * @param {number} [severity=2] The level of severity for the rule (0, 1, 2)
     * @returns {void}
     */
    addErrorSeverity: function(severity) {
        severity = severity || 2;
        this.ruleConfigs = this.ruleConfigs.map(function(config) {
            config.unshift(severity);
            return config;
        });
        // Add a single config at the beginning consisting of only the severity
        this.ruleConfigs.unshift(severity);
    },

    /**
     * Add rule configs from an array of strings (schema enums)
     * @param  {string[]} enums Array of valid rule options (e.g. ["always", "never"])
     * @returns {void}
     */
    addEnums: function(enums) {
        this.ruleConfigs = this.ruleConfigs.concat(combineArrays(this.ruleConfigs, enums));
    },

    /**
     * Add rule configurations from a schema object
     * @param  {Object} obj Schema item with type === "object"
     * @returns {void}
     */
    addObject: function(obj) {
        var objectConfigSet = {
            objectConfigs: [],
            add: function(property, values) {
                var optionObj;
                for (var idx = 0; idx < values.length; idx++) {
                    optionObj = {};
                    optionObj[property] = values[idx];
                    this.objectConfigs.push(optionObj);
                }
            },
            combine: function() {
                this.objectConfigs = groupByProperty(this.objectConfigs).reduce(function(accumulator, objArr) {
                    return combinePropertyObjects(accumulator, objArr);
                }, []);
            }
        };

        // The object schema could have multiple independent properties.
        // If any contain enums or booleans, they can be added and then combined
        Object.keys(obj.properties).forEach(function(prop) {
            if (obj.properties[prop].enum) {
                objectConfigSet.add(prop, obj.properties[prop].enum);
            }
            if (obj.properties[prop].type && obj.properties[prop].type === "boolean") {
                objectConfigSet.add(prop, [true, false]);
            }
        });
        objectConfigSet.combine();

        if (objectConfigSet.objectConfigs) {
            this.ruleConfigs = this.ruleConfigs.concat(combineArrays(this.ruleConfigs, objectConfigSet.objectConfigs));
        }
    }
};

/**
 * Generate valid rule configurations based on a schema object
 * @param   {Object} schema  A rule's schema object
 * @returns {array[]}        Valid rule configurations
 */
function generateConfigsFromSchema(schema) {
    var configSet = new RuleConfigSet();
    if (Array.isArray(schema)) {
        schema.forEach(function(opt) {
            if (opt.enum) {
                configSet.addEnums(opt.enum);
            }
            if (opt.type && opt.type === "object") {
                configSet.addObject(opt);
            }
            if (opt.oneOf) {
                // TODO (IanVS): not yet implemented
            }
        });
    }
    configSet.addErrorSeverity();
    return configSet.ruleConfigs;
}

/**
 * Generate possible rule configurations for all of the core rules
 * @returns {rulesConfig} Hash of rule names and arrays of possible configurations
 */
function createConfigsForCoreRules() {
    var ruleList = loadRules();
    return Object.keys(ruleList).reduce(function(accumulator, id) {
        var rule = rules.get(id);
        accumulator[id] = generateConfigsFromSchema(rule.schema);
        return accumulator;
    }, {});
}

/**
* Creates an object in which to store rule configs and error counts
*
* Unless a rulesConfig is provided at construction, the registry will not contain
* any rules, only methods.  This will be useful for building up registries manually.
*
* @constructor
* @class   Registry
* @param   {rulesConfig} [rulesConfig] Hash of rule names and arrays of possible configurations
*/
function Registry(rulesConfig) {
    this.rules = (rulesConfig) ? makeRegistryItems(rulesConfig) : {};
}

Registry.prototype = {

    constructor: Registry,

    /**
     * Populate the registry with core rule configs.
     *
     * This method is provided to avoid exposing createConfigsForCoreRules
     * in the public module API.  It will set the registry's `rule` property to
     * an object
     *
     * @returns {void}
     */
    populateFromCoreRules: function() {
        var rulesConfig = createConfigsForCoreRules();
        this.rules = makeRegistryItems(rulesConfig);
    },

    /**
     * Creates sets of rule configurations which can be used for linting
     * and initializes registry errors to zero for those configurations (side effect).
     *
     * This combines as many rules together as possible, such that the first sets
     * in the array will have the highest number of rules configured, and later sets
     * will have fewer and fewer, as not all rules have the same number of possible
     * configurations.
     *
     * The length of the returned array will be <= MAX_CONFIG_COMBINATIONS.
     *
     * @param   {Object}   registry The autoconfig registry
     * @returns {Object[]}          "rules" configurations to use for linting
     */
    buildRuleSets: function() {
        var idx = 0,
            ruleIds = Object.keys(this.rules),
            ruleSets = [];

        /**
         * Add a rule configuration from the registry to the ruleSets
         *
         * This is broken out into its own function so that it doesn't need to be
         * created inside of the while loop.
         *
         * @param   {string} rule The ruleId to add.
         * @returns {void}
         */
        var addRuleToRuleSet = function(rule) {
            // This check ensures that there is a rule configuration, and that
            // it either has fewer than the max cominbations allowed, or if it has
            // too many configs, we will only use the most basic of them.
            var hasFewCombos = (this.rules[rule].length <= MAX_CONFIG_COMBINATIONS);
            if (this.rules[rule][idx] && (hasFewCombos || this.rules[rule][idx].specificity <= 2)) {
                // If the rule has too many possible combinations, only take simple ones, avoiding objects.
                if (!hasFewCombos && typeof this.rules[rule][idx].config[1] === "object") {
                    return;
                }
                ruleSets[idx] = ruleSets[idx] || {};
                ruleSets[idx][rule] = this.rules[rule][idx].config;
                // Initialize errorCount to zero, since this is a config which will be linted
                this.rules[rule][idx].errorCount = 0;
            }
        }.bind(this);

        while (ruleSets.length === idx) {
            ruleIds.forEach(addRuleToRuleSet);
            idx += 1;
        }

        return ruleSets;
    },

    /**
     * Remove all items from the registry with a non-zero number of errors
     *
     * Note: this also removes rule configurations which were not linted
     * (meaning, they have an undefined errorCount).
     *
     * @returns {void}
     */
    stripFailingConfigs: function() {
        var ruleIds = Object.keys(this.rules),
            newRegistry = new Registry();

        newRegistry.rules = assign({}, this.rules);
        ruleIds.forEach(function(ruleId) {
            var errorFreeItems = newRegistry.rules[ruleId].filter(function(registryItem) {
                return (registryItem.errorCount === 0);
            });
            if (errorFreeItems.length > 0) {
                newRegistry.rules[ruleId] = errorFreeItems;
            } else {
                delete newRegistry.rules[ruleId];
            }
        });

        return newRegistry;
    },

    /**
     * Removes rule configurations which were not included in a ruleSet
     *
     * @returns {void}
     */
    stripExtraConfigs: function() {
        var ruleIds = Object.keys(this.rules),
            newRegistry = new Registry();

        newRegistry.rules = assign({}, this.rules);
        ruleIds.forEach(function(ruleId) {
            newRegistry.rules[ruleId] = newRegistry.rules[ruleId].filter(function(registryItem) {
                return (typeof registryItem.errorCount !== "undefined");
            });
        });

        return newRegistry;
    },

    /**
     * Create an eslint config for any rules which only have one configuration
     * in the registry.
     *
     * @returns {object} An eslint config with rules section populated
     */
    createConfig: function() {
        var ruleIds = Object.keys(this.rules),
            config = {rules: {}};

        ruleIds.forEach(function(ruleId) {
            if (this.rules[ruleId].length === 1) {
                config.rules[ruleId] = this.rules[ruleId][0].config;
            }
        }.bind(this));

        return config;
    },

    /**
     * Return a cloned registry containing only configs with a desired specificity
     *
     * @param   {number} specificity Only keep configs with this specificity
     * @returns {Registry}           A registry of rules
     */
    filterBySpecificity: function(specificity) {
        var ruleIds = Object.keys(this.rules),
            newRegistry = new Registry();

        newRegistry.rules = assign({}, this.rules);
        ruleIds.forEach(function(ruleId) {
            newRegistry.rules[ruleId] = this.rules[ruleId].filter(function(registryItem) {
                return (registryItem.specificity === specificity);
            });
        }.bind(this));

        return newRegistry;
    },

    /**
     * Lint SourceCodes against all configurations in the registry, and record results
     *
     * @param   {Object[]} sourceCodes  SourceCode objects for each filename
     * @param   {Object}   config       ESLint config object
     * @param   {progressCallback} [cb] Optional callback for reporting execution status
     * @returns {Registry}              New registry with errorCount populated
     */
    lintSourceCode: function(sourceCodes, config, cb) {
        var totalFilesLinting,
            lintConfig,
            lintResults,
            ruleSets,
            ruleSetIdx,
            filenames,
            lintedRegistry;

        lintedRegistry = new Registry();
        lintedRegistry.rules = assign({}, this.rules);
        ruleSets = lintedRegistry.buildRuleSets();
        lintedRegistry = lintedRegistry.stripExtraConfigs();

        debug("Linting with all possible rule combinations");
        filenames = Object.keys(sourceCodes);
        totalFilesLinting = filenames.length * ruleSets.length;
        filenames.forEach(function(filename) {
            debug("Linting file: " + filename);
            ruleSetIdx = 0;
            ruleSets.forEach(function(ruleSet) {
                lintConfig = assign({}, config, {rules: ruleSet});
                try {
                    lintResults = eslint.verify(sourceCodes[filename], lintConfig);
                    lintResults.forEach(function(result) {
                        lintedRegistry.rules[result.ruleId][ruleSetIdx].errorCount += 1;
                    });
                    // Deallocate for GC
                    lintResults = null;
                } catch (err) {
                    console.error(err);
                }
                ruleSetIdx += 1;
                if (cb) {
                    cb(totalFilesLinting);  // eslint-disable-line callback-return
                }
            });
            // Deallocate for GC
            sourceCodes[filename] = null;
        });

        return lintedRegistry;
    }
};

/**
 * Extract rule configuration into eslint:recommended where possible.
 *
 * This will return a new config with `"extends": "eslint:recommended"` and
 * only the rules which have configurations different from the recommended config.
 *
 * @param   {Object} config config object
 * @returns {Object}        config object using `"extends": "eslint:recommended"`
 */
function extendFromRecommended(config) {
    var newConfig = assign({}, config);
    var recRules = Object.keys(recConfig.rules).filter(function(ruleId) {
        return (recConfig.rules[ruleId] === 2 || recConfig.rules[ruleId][0] === 2);
    });

    recRules.forEach(function(ruleId) {
        if (isEqual(recConfig.rules[ruleId], newConfig.rules[ruleId])) {
            delete newConfig.rules[ruleId];
        }
    });
    newConfig.extends = "eslint:recommended";
    return newConfig;
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

module.exports = {
    RuleConfigSet: RuleConfigSet,
    generateConfigsFromSchema: generateConfigsFromSchema,
    Registry: Registry,
    extendFromRecommended: extendFromRecommended
};
