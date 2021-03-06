'use strict';

var Q = require('q');

var app = require('{{fire}}')('{{appId}}');

var http = require('http');

function merge(dest, source) {
	Object.keys(source).forEach(function(key) {
		dest[key] = source[key];
	});
	return dest;
}

function unauthenticatedError(authenticator) {
	var error = new Error();

	if(authenticator) {
		error.status = 403;
	}
	else {
		error.status = 401;
	}

	error.message = http.STATUS_CODES[error.status];
	return error;
}

function badRequestError() {
	var error = new Error();
	error.status = 400;
	error.message = http.STATUS_CODES[error.status];
	return error;
}

function _canUpdateProperties(propertyNames, model) {
	for(var i = 0, il = propertyNames.length; i < il; i++) {
		var propertyName = propertyNames[i];
		var property = model.getProperty(propertyName);

		// TODO: Implement function-based checks.
		if(property && (typeof property.options.canUpdate != 'undefined' && property.options.canUpdate !== true || typeof property.options.canSet != 'undefined' && property.options.canSet !== true)) {
			return false;
		}
	}

	return true;
}

function _canSetProperties(propertyNames, model) {
	for(var i = 0, il = propertyNames.length; i < il; i++) {
		var propertyName = propertyNames[i];
		var property = model.getProperty(propertyName);

		// TODO: Implement function-based checks.
		if(property && typeof property.options.canSet != 'undefined' && property.options.canSet !== true) {
			return false;
		}
	}

	return true;
}

function findAuthenticator(authenticatorModel, request) {
	if(!authenticatorModel) {
		return Q.when(null);
	}

	var credentials = null;
	if(request.headers.authorization && request.headers.authorization.length > 6) {
		credentials = (new Buffer(request.headers.authorization.substring(6), 'base64')).toString('utf8').split(':');

		if(!credentials.length) {
			credentials = null;
		}
		else if(credentials.length == 1) {
			credentials.push('');
		}
	}

	if(credentials) {
		var findMap = {};
		findMap[authenticatorModel.options.authenticatingProperty.name] = credentials[0];
		findMap.accessToken = credentials[1];
		return authenticatorModel.findOne(findMap);
	}

	if(!request.session.at) {
		return Q.when(null);
	}

	return authenticatorModel.findOne({accessToken: request.session.at});
}

{{#model.isAuthenticator}}
app.get('/api/{{model.resourceName}}/me', function(request, {{model.dependencyName}}, {{model.name}}LoginTokenModel) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			if(authenticator) {
				request.session.save();
				return authenticator;
			}
			else {
				if(request.query.t) {
					var expireDate = new Date();
					expireDate.setDate(expireDate.getDate() - 14);

					return {{model.name}}LoginTokenModel.findOne({token: request.query.t, createdAt:{$gt: expireDate}})
						.then(function(loginToken) {
							if(loginToken) {
								return {{model.dependencyName}}.getOne({id: loginToken.authenticator})
									.then(function(authenticator) {
										request.session.at = authenticator.accessToken;
										return authenticator;
									});
							}
							else {
								throw unauthenticatedError(null);
							}
						});
				}
				else {
					throw unauthenticatedError(null);
				}
			}
		});
});

app.delete('/api/{{model.resourceName}}/access-token', function(request, {{model.dependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			if(authenticator) {
				request.session.at = null;
				authenticator.accessToken = null;
				return authenticator.save();
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		})
		.then(function() {
			return {};
		});
});
{{/model.isAuthenticator}}
{{#model.isPasswordBasedAuthenticator}}
app.post('/api/{{model.resourceName}}/access-token', function(request, {{model.dependencyName}}) {
	return {{model.dependencyName}}.authorize({ {{model.authenticatingPropertyName}}: request.body.{{model.authenticatingPropertyName}}, password: request.body.password})
		.then(function(modelInstance) {
			request.session.at = modelInstance.accessToken;
			return modelInstance;
		});
});

app.put('/api/{{model.resourceName}}/password', function(request, {{model.dependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			return authenticator.changePassword(request.body.currentPassword, request.body.newPassword, request.body.confirmPassword);
		})
		.then(function(authenticator) {
			request.session.at = authenticator.accessToken;
			return {};
		})
		.catch(function(error) {
			error.status = 404;
			throw error;
		});
});

app.delete('/api/{{model.resourceName}}/password', function(request, {{model.dependencyName}}, {{model.name}}ResetPasswordModel) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			if(authenticator && request.body.{{model.authenticatingPropertyName}} != authenticator['{{model.authenticatingPropertyName}}']) {
				var error = new Error('Forbidden');
				error.status = 403;
				throw error;
			}
		})
		.then(function() {
			return {{model.dependencyName}}.forgotPassword(request.body.{{model.authenticatingPropertyName}});
		});
});

app.post('/api/{{model.resourceName}}/password', function(request, {{model.dependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function() {
			return {{model.dependencyName}}.resetPassword(request.body.resetToken, request.body.newPassword, request.body.confirmPassword);
		})
		.then(function(authenticator) {
			request.session.at = authenticator.accessToken;
			return authenticator;
		});
});{{/model.isPasswordBasedAuthenticator}}

{{#model.isPasswordlessAuthenticator}}
app.post('/api/{{model.resourceName}}', function() {
	var error = new Error();
	error.status = 404;
	error.message = 'Not Found';
	throw error;
});
{{/model.isPasswordlessAuthenticator}}

app.post('/api/{{model.resourceName}}', function(app, response, request, {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canCreate({authenticator: authenticator, request: request, response: response}))
				.then(function(canCreate) {
					if(canCreate) {
						var checkCreateMap = function(createMap) {
							if(typeof canCreate == 'object') {
								createMap = merge(createMap, canCreate);
							}

							if({{model.dependencyName}}.options.automaticPropertyName) {
								createMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
							}



							if(_canSetProperties(Object.keys(createMap), {{model.dependencyName}})) {
								return createMap;
							}
							else {
								throw badRequestError();
							}
						};

						if(Array.isArray(request.body)) {
							{{#model.isAuthenticator}}
							var error = badRequestError();
							error.message = 'Cannot create multiple authenticator models.';
							throw error;{{/model.isAuthenticator}}{{^model.isAuthenticator}}

							var createMaps = request.body.map(function(createMap) {
								return checkCreateMap(createMap);
							});

							return {{model.dependencyName}}.create(createMaps, {authenticator: authenticator, request: request, response: response});
							{{/model.isAuthenticator}}
						}
						else {
							return {{model.dependencyName}}.create(checkCreateMap(request.body || {}), {authenticator: authenticator, request: request, response: response}){{#model.isAuthenticator}}
								.then(function(modelInstance) {
									request.session.at = modelInstance.accessToken;
									return modelInstance;
								}){{/model.isAuthenticator}};
						}
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/{{model.resourceName}}/_count', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			var propertyName = null;



			if(whereMap.$options) {
				propertyName = whereMap.$options.propertyName;
				delete whereMap.$options;
			}

			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return {{model.dependencyName}}.count(propertyName, whereMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.search('/api/{{model.resourceName}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			var optionsMap = {};
			var searchText = whereMap._search;
			if(typeof whereMap._search != 'undefined') {
				delete whereMap._search;
			}

			if(typeof whereMap.$options != 'undefined') {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}
			optionsMap.isShallow = true;

			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			if(!searchText || searchText.length === 0) {
				throw badRequestError();
			}
			else {
				var accessControl = {{model.dependencyName}}.getAccessControl();
				return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
					.then(function(canRead) {
						if(canRead) {
							if(typeof canRead == 'object') {
								whereMap = merge(whereMap, canRead);
							}

							return {{model.dependencyName}}.search(searchText, whereMap, optionsMap);
						}
						else {
							throw unauthenticatedError(authenticator);
						}
					});
			}
		});
});

app.get('/api/{{model.resourceName}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			var optionsMap = {};

			if(whereMap.$options) {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}
			optionsMap.isShallow = true;

			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return {{model.dependencyName}}.find(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/{{model.resourceName}}/:id', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			whereMap.id = request.params.id;

			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			var optionsMap = {};

			if(whereMap.$options) {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}

			optionsMap.isShallow = true;

			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return {{model.dependencyName}}.getOne(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.put('/api/{{model.resourceName}}/:id', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	var accessControl = {{model.dependencyName}}.getAccessControl();
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};

			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			whereMap.id = request.params.id;

			return Q.when(accessControl.canUpdate({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canUpdate) {
					if(canUpdate) {
						if(typeof canUpdate == 'object') {
							whereMap = merge(whereMap, canUpdate);
						}

						return [_canUpdateProperties(Object.keys(request.body), {{model.dependencyName}}), whereMap, authenticator];
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		})
		.all()
		.spread(function(canUpdateProperties, whereMap, authenticator) {
			if(canUpdateProperties) {
				return Q.all([{{model.dependencyName}}.updateOne(whereMap, request.body), authenticator]);
			}
			else {
				throw badRequestError();
			}
		})
		.spread(function(modelInstance, authenticator) {
			if(modelInstance) {
				return modelInstance;
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		})
		.catch(function(error) {
			throw error;
		});
});

app.put('/api/{{model.resourceName}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};

			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canUpdate({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canUpdate) {
					if(canUpdate) {
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), {{model.dependencyName}}))
							.then(function(canUpdateProperties) {
								if(canUpdateProperties) {
									if(typeof canUpdate == 'object') {
										whereMap = merge(whereMap, canUpdate);
									}

									return {{model.dependencyName}}.update(whereMap, request.body || {});
								}
								else {
									throw badRequestError();
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			var optionsMap = null;
			if(whereMap.$options) {
                optionsMap = whereMap.$options;
                delete whereMap.$options;
            }

			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canDelete({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canDelete) {
					if(canDelete) {
						if(typeof canDelete == 'object') {
							whereMap = merge(whereMap, canDelete);
						}

						return {{model.dependencyName}}.remove(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			whereMap.id = request.params.id;
			if({{model.dependencyName}}.options.automaticPropertyName) {
				whereMap[{{model.dependencyName}}.options.automaticPropertyName] = authenticator;
			}

			var optionsMap = null;
			if(whereMap.$options) {
                optionsMap = whereMap.$options;
                delete whereMap.$options;
            }

			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canDelete({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
			.then(function(canDelete) {
				if(canDelete) {
					if(typeof canDelete == 'object') {
						whereMap = merge(whereMap, canDelete);
					}

					return {{model.dependencyName}}.removeOne(whereMap, optionsMap);
				}
				else {
					throw unauthenticatedError(authenticator);
				}
			});
		});
});

{{#model.properties}}
{{#isOneToOne}}
app.post('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var property = {{model.dependencyName}}.getProperty('{{name}}');
			return Q.all([
				typeof property.options.canCreate != 'undefined' ? app.injector.call(property.options.canCreate, {request: request, response: response, authenticator: authenticator}) : true,
				authenticator
			]);
		})
		.spread(function(canCreate, authenticator) {
			if(typeof canCreate == 'object') {
				throw new Error('PropertyTypes#CanCreate does not support returning an object. Either return true or false. AccessControl#CanCreate supports returning objects.');
			}

			if(canCreate !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				return authenticator;
			}
		})
		.then(function(authenticator) {
			var property = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = property.getAssociatedModel();

			var accessControl = associatedModel.getAccessControl();
			return Q.when(accessControl.canCreate({authenticator: authenticator, request: request, response: response}))
				.then(function(canCreate) {
					if(canCreate) {
						var createMap = request.body || {};

						if(typeof canCreate == 'object') {
							createMap = merge(createMap, canCreate);
						}

						createMap[property.options.hasOne || property.options.belongsTo] = request.params.id;

						if(associatedModel.options.automaticPropertyName) {
							// This is definitely a bad request if the user tries to set the automatic property manually.
							if(createMap[associatedModel.options.automaticPropertyName] && createMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
								var error = new Error('Cannot set automatic property manually.');
								error.status = 400;
								throw error;
							}

							createMap[associatedModel.options.automaticPropertyName] = authenticator;
						}

						if(_canSetProperties(Object.keys(createMap), associatedModel)) {
							return associatedModel.create(createMap, {authenticator: authenticator, request: request, response: response});
						}
						else {
							throw badRequestError();
						}
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.options.relationshipVia.model;

			var whereMap = request.query || {};
			var optionsMap = {};

			if(whereMap.$options) {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}

			whereMap[association.options.relationshipVia.name] = request.params.id;

			if(associatedModel.options.automaticPropertyName) {
				if(whereMap[associatedModel.options.automaticPropertyName] && whereMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
					var error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				whereMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = associatedModel.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return associatedModel.findOne(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.getAssociatedModel();

			var accessControl = associatedModel.getAccessControl();
			return Q.all([accessControl.canDelete({authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete) {
				var removeMap = request.query || {};

				if(typeof canDelete == 'object') {
					removeMap = merge(removeMap, canDelete);
				}

				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				removeMap[association.options.hasOne || association.options.belongsTo] = request.params.id;

				if(associatedModel.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[associatedModel.options.automaticPropertyName] && removeMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
						throw badRequestError();
					}

					removeMap[associatedModel.options.automaticPropertyName] = authenticator;
				}

				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				return associatedModel.removeOne(removeMap, optionsMap);
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		});
});

app.put('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.getAssociatedModel();

			var whereMap = request.query || {};

			whereMap[association.options.hasOne || association.options.belongsTo] = request.params.id;

			if(associatedModel.options.automaticPropertyName) {
				if(whereMap[associatedModel.options.automaticPropertyName] && whereMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
					var error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				whereMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = associatedModel.getAccessControl();
			return Q.when(accessControl.canUpdate({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canUpdate) {
					if(canUpdate) {
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), association.options.relationshipVia.model))
							.then(function(canUpdateProperties) {
								if(canUpdateProperties) {
									if(typeof canUpdate == 'object') {
										whereMap = merge(whereMap, canUpdate);
									}

									return associatedModel.updateOne(whereMap, request.body || {});
								}
								else {
									throw badRequestError();
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});
{{/isOneToOne}}
{{#isOneToMany}}
app.post('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var property = {{model.dependencyName}}.getProperty('{{name}}');
			return Q.all([typeof property.options.canCreate != 'undefined' ? app.injector.call(property.options.canCreate, {request: request, response: response, authenticator: authenticator}) : true, authenticator]);
		})
		.spread(function(canCreate, authenticator) {
			if(typeof canCreate == 'object') {
				throw new Error('PropertyTypes#CanCreate does not support returning an object. Either return true or false. AccessControl#CanCreate supports returning objects.');
			}

			if(canCreate !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				return authenticator;
			}
		})
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getAssociation('{{name}}');
			var associatedModel = association.getAssociatedModel();

			var accessControl = associatedModel.getAccessControl();
			return Q.when(accessControl.canCreate({authenticator: authenticator, request: request, response: response}))
				.then(function(canCreate) {
					if(canCreate) {
						var createMap = request.body || {};
						createMap[association.options.hasMany] = request.params.id;

						if(typeof canCreate == 'object') {
							createMap = merge(createMap, canCreate);
						}

						if(associatedModel.options.automaticPropertyName) {
							if(createMap[associatedModel.options.automaticPropertyName] && createMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
								var error = new Error('Cannot set automatic property manually.');
								error.status = 400;
								throw error;
							}

							createMap[associatedModel.options.automaticPropertyName] = authenticator;
						}

						if(_canSetProperties(Object.keys(createMap), associatedModel)) {
							return associatedModel.create(createMap, {authenticator: authenticator, request: request, response: response});
						}
						else {
							throw badRequestError();
						}
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.options.relationshipVia.model;

			var whereMap = request.query || {};
			var optionsMap = {};

			if(whereMap.$options) {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}

			optionsMap.isShallow = true;

			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.options.relationshipVia.model;

			if(typeof canRead == 'object') {
				whereMap = merge(whereMap, canRead);
			}

			whereMap[association.options.relationshipVia.name] = request.params.id;

			if(associatedModel.options.automaticPropertyName) {
				if(whereMap[associatedModel.options.automaticPropertyName] && whereMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
					var error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				whereMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = associatedModel.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return associatedModel.find(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.getAssociatedModel();

			var accessControl = associatedModel.getAccessControl();

			return Q.all([accessControl.canDelete({authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete) {
				var removeMap = request.query || {};
				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				if(typeof canDelete == 'object') {
					removeMap = merge(removeMap, canDelete);
				}

				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				removeMap[association.options.hasMany] = request.params.id;
				removeMap.id = request.params.associationID;

				if(associatedModel.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[associatedModel.options.automaticPropertyName] && removeMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
						var error = new Error('Cannot set automatic property manually.');
						error.status = 400;
						throw error;
					}

					removeMap[associatedModel.options.automaticPropertyName] = authenticator;
				}

				return associatedModel.removeOne(removeMap, optionsMap);
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.getAssociatedModel();

			var accessControl = associatedModel.getAccessControl();
			return Q.all([accessControl.canDelete({authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete) {
				var removeMap = request.query || {};

				if(typeof canDelete == 'object') {
					removeMap = merge(removeMap, canDelete);
				}

				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				removeMap[association.options.hasMany] = request.params.id;

				if(associatedModel.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[associatedModel.options.automaticPropertyName] && removeMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
						var error = new Error('Cannot set automatic property manually.');
						error.status = 400;
						throw error;
					}

					removeMap[associatedModel.options.automaticPropertyName] = authenticator;
				}

				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				return associatedModel.remove(removeMap, optionsMap);
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		});
});

app.put('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.options.relationshipVia.model;

			var whereMap = request.query || {};
			whereMap[association.options.relationshipVia.name] = request.params.id;
			whereMap.id = request.params.associationID;

			if(associatedModel.options.automaticPropertyName) {
				// This is definitely a bad request if the user tries to set the automatic property manually.
				if(whereMap[associatedModel.options.automaticPropertyName] && whereMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
					error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				whereMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = associatedModel.getAccessControl();
			return Q.when(accessControl.canUpdate({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canUpdate) {
					if(canUpdate) {
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), associatedModel))
							.then(function(canUpdateProperties) {
								var error;
								if(canUpdateProperties) {
									if(typeof canUpdate == 'object') {
										whereMap = merge(whereMap, canUpdate);
									}

									return associatedModel.updateOne(whereMap, request.body);
								}
								else {
									throw badRequestError();
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.put('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.options.relationshipVia.model;

			var accessControl = associatedModel.getAccessControl();
			return Q.when(accessControl.canUpdate({authenticator: authenticator, request: request, response: response}))
				.then(function(canUpdate) {
					if(canUpdate) {
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), associatedModel))
							.then(function(canUpdateProperties) {
								var error;
								if(canUpdateProperties) {
									var whereMap = request.query || {};
									whereMap[association.options.relationshipVia.name] = request.params.id;

									if(typeof canUpdate == 'object') {
										whereMap = merge(whereMap, canUpdate);
									}

									if(associatedModel.options.automaticPropertyName) {
										// This is definitely a bad request if the user tries to set the automatic property manually.
										if(whereMap[associatedModel.options.automaticPropertyName] && whereMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
											error = new Error('Cannot set automatic property manually.');
											error.status = 400;
											throw error;
										}

										whereMap[associatedModel.options.automaticPropertyName] = authenticator;
									}

									return associatedModel.update(whereMap, request.body);
								}
								else {
									throw badRequestError();
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});
{{/isOneToMany}}

{{#isManyToMany}}
app.post('/api/{{model.resourceName}}/:id/{{resource}}', function(request, app, response,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{model.dependencyName}}.getAccessControl();
			var property = {{model.dependencyName}}.getProperty('{{name}}');
			return Q.all([typeof property.options.canCreate != 'undefined' ? app.injector.call(property.options.canCreate, {request: request, response: response, authenticator: authenticator}) : true, authenticator]);
		})
		.spread(function(canCreate, authenticator) {
			if(canCreate !== true) {
				throw unauthenticatedError(authenticator);
			}
			else {
				return authenticator;
			}
		})
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getAssociation('{{name}}');
			var throughModel = association.options.through;

			var accessControl = throughModel.getAccessControl();
			return Q.when(accessControl.canCreate({authenticator: authenticator, request: request, response: response}))
				.then(function(canCreate) {
					if(canCreate) {
						var createMap = request.body || {};
						createMap[association.options.throughPropertyName] = request.params.id;

						if(typeof canCreate == 'object') {
							createMap = merge(createMap, canCreate);
						}

						if(throughModel.options.automaticPropertyName) {
							if(createMap[throughModel.options.automaticPropertyName]) {
								var error = new Error('Cannot set automatic property manually.');
								error.status = 400;
								throw error;
							}

							createMap[throughModel.options.automaticPropertyName] = authenticator;
						}

						if(_canSetProperties(Object.keys(createMap), throughModel)) {
							return throughModel.create(createMap, {authenticator: authenticator, request: request, response: response});
						}
						else {
							throw badRequestError();
						}
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		})
		.then(function() {
			// TODO: Are we returning the correct model instance here?
			return {{model.dependencyName}}.findOne({id: request.params.id});
		});
});

app.get('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			var optionsMap = {};

			if(whereMap.$options) {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}

			optionsMap.isShallow = true;

			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.options.relationshipVia.model;

			whereMap[association.options.relationshipVia.name] = request.params.id;

			if(associatedModel.options.automaticPropertyName) {
				if(whereMap[associatedModel.options.automaticPropertyName] && whereMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
					var error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				whereMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = {{model.dependencyName}}.getAccessControl();
			return Q.when(accessControl.canRead(app, {authenticator: authenticator, request: request, response: response}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return associatedModel.find(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}, {{throughModelDependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{throughModelDependencyName}}.getAccessControl();
			return Q.all([app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete) {
				var removeMap = request.query || {};

				if(typeof canDelete == 'object') {
					removeMap = merge(removeMap, canDelete);
				}

				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				removeMap[association.options.throughPropertyName] = request.params.id;
				removeMap[association.options.relationshipVia.options.throughPropertyName] = request.params.associationID;

				if({{throughModelDependencyName}}.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[{{throughModelDependencyName}}.options.automaticPropertyName]) {
						var error = new Error('Cannot set automatic property manually.');
						error.status = 400;
						throw error;
					}

					removeMap[{{throughModelDependencyName}}.options.automaticPropertyName] = authenticator;
				}

				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				return {{throughModelDependencyName}}.removeOne(removeMap, optionsMap);
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		});
});

app.delete('/api/{{model.resourceName}}/:id/{{resource}}', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}, {{throughModelDependencyName}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var accessControl = {{throughModelDependencyName}}.getAccessControl();
			return Q.all([app.injector.call(accessControl.getPermissionFunction('delete'), {authenticator: authenticator, request: request, response: response}), authenticator]);
		})
		.spread(function(canDelete, authenticator) {
			if(canDelete) {
				var removeMap = request.query || {};

				if(typeof canDelete == 'object') {
					removeMap = merge(removeMap, canDelete);
				}

				var association = {{model.dependencyName}}.getProperty('{{name}}');
				var associatedModel = association.getAssociatedModel();

				removeMap[association.options.throughPropertyName] = request.params.id;

				if({{throughModelDependencyName}}.options.automaticPropertyName) {
					// This is definitely a bad request if the user tries to set the automatic property manually.
					if(removeMap[{{throughModelDependencyName}}.options.automaticPropertyName]) {
						var error = new Error('Cannot set automatic property manually.');
						error.status = 400;
						throw error;
					}

					removeMap[{{throughModelDependencyName}}.options.automaticPropertyName] = authenticator;
				}

				var optionsMap = {};

				if(removeMap.$options) {
					optionsMap = removeMap.$options;
					delete removeMap.$options;
				}

				return {{throughModelDependencyName}}.removeOne(removeMap, optionsMap);
			}
			else {
				throw unauthenticatedError(authenticator);
			}
		});
});

app.put('/api/{{model.resourceName}}/:id/{{resource}}/:associationID', function(request, response, app,  {{model.dependencyName}}{{^model.isAuthenticator}}{{#model.authenticatorDependencyName}}, {{model.authenticatorDependencyName}}{{/model.authenticatorDependencyName}}{{/model.isAuthenticator}}) {
	return findAuthenticator({{model.authenticatorDependencyName}}{{^model.authenticatorDependencyName}}null{{/model.authenticatorDependencyName}}, request)
		.then(function(authenticator) {
			var association = {{model.dependencyName}}.getProperty('{{name}}');
			var associatedModel = association.options.relationshipVia.model;

			var whereMap = {};
			whereMap[association.options.relationshipVia.name] = request.params.id;
			whereMap.id = request.params.associationID;

			if(associatedModel.options.automaticPropertyName) {
				// This is definitely a bad request if the user tries to set the automatic property manually.
				if(whereMap[associatedModel.options.automaticPropertyName] && whereMap[associatedModel.options.automaticPropertyName] != authenticator.id) {
					var error = new Error('Cannot set automatic property manually.');
					error.status = 400;
					throw error;
				}

				whereMap[associatedModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = associatedModel.getAccessControl();
			return Q.when(app.injector.call(accessControl.getPermissionFunction('update'), {authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canUpdate) {
					if(canUpdate) {
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), association.options.relationshipVia.model))
							.then(function(canUpdateProperties) {
								if(canUpdateProperties) {
									if(typeof canUpdate == 'object') {
										whereMap = merge(whereMap, canUpdate);
									}

									return associatedModel.updateOne(whereMap, request.body || {});
								}
								else {
									var error = new Error();
									error.status = 400;
									error.message = 'Bad Request';
									throw error;
								}
							});
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});{{/isManyToMany}}{{/model.properties}}
