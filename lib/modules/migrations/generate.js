'use strict';

exports = module.exports = Generate;

var firestarter = require('./../../..')._getFirestarter();

var path = require('path');
var utils = require('./../../helpers/utils');
var Model = require('./../models/model');
var Migrations = require('./');

var Q = require('q');

var pg = require('pg');
pg.defaults.poolIdleTimeout = 500;

var mu = require('mu2');
var debug = require('debug')('fire:generate');

/**
 * This module, executed from the cli, is responsible for the creation of the migrations.
 *
 * @access private
 *
 * @param {App} app
 * @param {String} startPath The root path of the app.
 * @constructor
 */
function Generate(app, startPath) {
	this.path = startPath;
	this.delegate = null;
	this.app = app;
}

/**
 * This method creates the migrations by loading all the migrations in a Models module, and loading all existing models in another Models module. Then migrations are created based on the differences of the two Models.
 *
 * Warning: this method swizzles (replaces) some methods on the Model's prototype and it currently does not sets them back.
 */
Generate.prototype.createMigrations = function() {
	function addPropertiesMigrationTask(model, properties) {
		var string = '\tthis.models.' + model.getName() + '.addProperties({\n';

		string += properties.map(function(property) {
			return '\t\t' + property.name + ': ' + propertyTypesToString(property);
		}).join(',\n') + '\n';

		string += '\t});\n';
		return string;
	}

	function changePropertiesMigrationTask(model, properties) {
		var string = '\tthis.models.' + model.getName() + '.changeProperties({\n';

		string += properties.map(function(property) {
			return '\t\t' + property.name + ': ' + propertyTypesToString(property);
		}).join(',\n') + '\n';

		string += '\t});\n';
		return string;
	}

	function removePropertiesMigrationTask(model, properties) {
		var string = '\tthis.models.' + model.getName() + '.removeProperties([';

		string += properties.map(function(property) {
			return '\'' + property.name + '\'';
		}).join(', ');

		string += ']);\n';
		return string;
	}

	function sqlMigrationTask(hash, sql) {
		debug('sqlMigrationTask `' + sql + '`');

		return '\tthis.models._sql(\'' + hash + '\', [\n' + sql.split('\n').map(function(line) {
			return '\t\t\'' + line.replace(/\'/g, '\\\'') + '\'';
		}).join(',\n') + '\n\t].join(\'\\n\'));\n';
	}

	function createModelMigrationTask(model) {
		debug('createModelMigrationTask');

		var string = '\tthis.models.createModel(\'' + model.getName() + '\', {\n';

		var propertiesMap = model.getAllProperties();

		var properties = Object.keys(propertiesMap).map(function(propertyName) {
			var property = propertiesMap[propertyName];

			return '\t\t' + propertyName + ': ' + propertyTypesToString(property);
		});

		string += properties.join(',\n') + '\n';
		string += '\t});\n';
		return string;
	}

	function destroyModelMigrationTask(model) {
		return '\tthis.models.destroyModel(\'' + model.getName() + '\');\n';
	}

	function propertyTypesToString(property) {
		return '[' + property.signature.map(function(type) {
			if(!type) {
				throw new Error('No `type` in propertyTypesToString() in property ' + property.model.getName() + '#' + property.name + '.');
			}

			var propertyTypeString = 'this.' + type.name;

			if(type.params && type.params.length > 0 && type.params[0] != property) {
				propertyTypeString += '(' + type.params.map(function(value, index) {
					// TOOD: Check if `value` is a model thingy?
					// TODO: Check if `value` exists on model?
					// For now, let's check if this is: Reference, Many, HasOne, HasMany

					var name = value;

					if(value instanceof Model) {
						name = value.getName();
					}

					if(['HasOne', 'HasMany', 'BelongsTo'].indexOf(type.name) >= 0) {
						if(index === 0) {
							return 'this.models.' + name;
						}
						else {
							if(typeof name == 'object') {
								// We cannot use JSON as it creates strings of strings.
								var result = [];

								Object.keys(name).forEach(function(key) {
									var obj = name[key];

									if(obj instanceof Model) {
										result.push(key + ': ' + 'this.models.' + obj.getName());
									}
									else {
										result.push(key + ': \'' + obj + '\'');
									}
								});

								return '{' + result.join(', ') + '}';
							}
							else {
								return name;
							}
						}
					}
					else {
						if(typeof name == 'string') {
							return '\'' + name.replace(/'/g, '\\\'') + '\'';
						}
						else if(Array.isArray(name)) {
							return '[' + name.map(function(val) {
								if(typeof val == 'string') {
									return '\'' + val.replace(/'/g, '\\\'') + '\'';
								}
								else {
									return val;
								}
							}).join(', ') + ']';
						}
						else if(typeof name == 'function') {
							return 'function noop() {}';
						}
						else {
							return name;
						}
					}
				}).join(', ') + ')';
			}

			return propertyTypeString;
		}).join(', ') + ']';
	}

	if(!this.delegate) {
		throw new Error('No delegate set on Generate.');
	}

	if(!this.app) {
		throw new Error('No app set on Generate.');
	}

	var self = this;

	//this.swizzleMethods();

	var toVersion = 0;
	var basePath = this.path;

	var oldApp = firestarter.app(this.app.container.id, this.app.name + '-old', this.app._settings);
	oldApp.models.isSetupPrevented = true;

	delete this.app.container.appsMap[oldApp.name];

	var oldModels = oldApp.models;

	var migrations 	= new Migrations(oldApp, oldModels);

	var newModels = this.app.models;

	debug('Loading migrations to `oldModels` from `' + path.join(basePath, '.fire', 'migrations') + '`.');

	var loadPath = (self.app.container.numberOfApps() > 1 ? path.join(basePath, '.fire', 'migrations', self.app.name) : path.join(basePath, '.fire', 'migrations'));

	// and load all migrations
	return Q.delay(1)
		.then(function() {
			return migrations.loadMigrations(loadPath);
		})
		.then(function() {
			debug('Reseting migration-models');

			// Now we copy all models and remove them from the models
			// We do a soft-migration to the last migration
			// Then compare all models created by the soft migration with the models we copied earlier
			// We create migrations based on the differences
			// Let's go!

			return migrations.resetAllModels();
		})
		.then(function() {
			if(migrations._.length > 0) {
				var lastMigration = migrations._[migrations._.length - 1];
				toVersion = lastMigration.version;
			}

			debug('Soft migrating to ' + toVersion);

			return migrations.softMigrate(toVersion);
		})
		/*.then(function() {
			return newModels.setup(basePath);
		})*/
		.then(function() {
			debug('Calling modules migrate');

			self.app.modules.forEach(function(module_) {
				if(module_.migrate) {
					module_.migrate(newModels);
				}
			});
		})
		.then(function() {
			debug('Creating migration tasks');

			var upMigrationTasks = [];
			var downMigrationTasks = [];

			// Now check the copied models and figure out what to migrate
			newModels.forEach(function(newModel) {
				debug('Checking model `' + newModel.getName() + '`');

				var oldModel = oldModels.findModel(newModel.getName());

				if(newModel.isShared() && !self.app.settings('isMaster') && self.app.container.numberOfApps() > 1) {
					debug('Not creating shared model, not a master app.');
				}
				else if(!oldModel) {
					upMigrationTasks.push(createModelMigrationTask(newModel));
					downMigrationTasks.push(destroyModelMigrationTask(newModel));
				}
				else {
					// Check all properties and see if something changed
					var removedProperties = [];
					var addedProperties = [];
					var changedProperties = [];
					var originalChangedProperties = [];

					var newPropertiesMap = newModel.getAllProperties();
					var oldPropertiesMap = oldModel.getAllProperties();

					var parsedPropertyNames = [];

					Object.keys(newPropertiesMap).forEach(function(propertyName) {
						var oldProperty = oldPropertiesMap[propertyName];
						var newProperty = newPropertiesMap[propertyName];

						if(!oldProperty) {
							addedProperties.push(newProperty);
						}
						else {
							var new_ = propertyTypesToString(newProperty);
							var old = propertyTypesToString(oldProperty);

							if(new_ != old) {
								changedProperties.push(newProperty);
								originalChangedProperties.push(oldProperty);
							}
						}

						parsedPropertyNames.push(propertyName);
					});

					Object.keys(oldPropertiesMap).forEach(function(propertyName) {
						if(parsedPropertyNames.indexOf(propertyName) == -1) {
							removedProperties.push(oldPropertiesMap[propertyName]);
						}
					});

					if(addedProperties.length > 0) {
						upMigrationTasks.push(addPropertiesMigrationTask(newModel, addedProperties));
						downMigrationTasks.push(removePropertiesMigrationTask(newModel, addedProperties));
					}

					if(removedProperties.length > 0) {
						upMigrationTasks.push(removePropertiesMigrationTask(newModel, removedProperties));
						downMigrationTasks.push(addPropertiesMigrationTask(newModel, removedProperties));
					}

					if(changedProperties.length > 0) {
						upMigrationTasks.push(changePropertiesMigrationTask(newModel, changedProperties));
						downMigrationTasks.push(changePropertiesMigrationTask(newModel, originalChangedProperties));
					}
				}
			});

			debug('Checking sql');

			Object.keys(newModels._sqlMap).forEach(function(hash) {
				var newSql = newModels._sqlMap[hash];
				var oldSql = oldModels._sqlMap[hash];

				if(!self.app.settings('isMaster') && self.app.container.numberOfApps() > 1) {
					debug('Not adding sql in non-master app.');
				}
				else if(!oldSql) {
					upMigrationTasks.push(sqlMigrationTask(hash, newSql[0]));

					if(newSql.length > 1 && newSql[1].length) {
						downMigrationTasks.push(sqlMigrationTask(hash, newSql[1]));
					}
				}
			});

			if(upMigrationTasks.length > 0 || downMigrationTasks.length > 0) {
				var version = (parseInt(toVersion) + 1);
				var migrationFileName;
				if(version == 1) {
					migrationFileName = '001.js';
				}
				else {
					migrationFileName = utils.zeroPad(version, 100) + '.js';
				}

				// TODO: Check to see if directory exists.

				var stream = mu.compileAndRender(path.join(__dirname, 'templates', 'migration.js'), {
					migrationName: 'Migration',
					upTasks: function() {
						return upMigrationTasks.map(function(contents) {
							return {contents: contents};
						});
					},
					downTasks: function() {
						return downMigrationTasks.map(function(contents) {
							return {contents: contents};
						});
					}
				});

				var result = Q.when(true);

				if(self.delegate.addMigration) {
					result = Q.when(self.delegate.addMigration(migrationFileName, stream));
				}

				return result
					.then(function() {
						console.log('Created migration file at `' + migrationFileName + '`.');
						return true;
					});
			}
			else {
				console.log('Your local migrations are up-to-date.');
				return false;
			}
		})
		.catch(function(error) {
			console.log(error);
			console.log(error.stack);

			throw error;
		})
		.finally(function() {
			return oldApp && oldApp.stop();
		});
};
