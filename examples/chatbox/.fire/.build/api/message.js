'use strict';

var Q = require('q');

var fire = require('fire');
var app = fire.app('chatbox');

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





app.post('/api/messages', function(app, response, request, MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var accessControl = MessageModel.getAccessControl();
			return Q.when(accessControl.canCreate({authenticator: authenticator, request: request, response: response}))
				.then(function(canCreate) {
					if(canCreate) {
						var checkCreateMap = function(createMap) {
							if(typeof canCreate == 'object') {
								createMap = merge(createMap, canCreate);
							}

							if(MessageModel.options.automaticPropertyName) {
								createMap[MessageModel.options.automaticPropertyName] = authenticator;
							}



							if(_canSetProperties(Object.keys(createMap), MessageModel)) {
								return createMap;
							}
							else {
								throw badRequestError();
							}
						};

						if(Array.isArray(request.body)) {
							

							var createMaps = request.body.map(function(createMap) {
								return checkCreateMap(createMap);
							});

							return MessageModel.create(createMaps, {authenticator: authenticator, request: request, response: response});
							
						}
						else {
							return MessageModel.create(checkCreateMap(request.body || {}), {authenticator: authenticator, request: request, response: response});
						}
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/messages/_count', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			var propertyName = null;



			if(whereMap.$options) {
				propertyName = whereMap.$options.propertyName;
				delete whereMap.$options;
			}

			if(MessageModel.options.automaticPropertyName) {
				whereMap[MessageModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = MessageModel.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return MessageModel.count(propertyName, whereMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/messages', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			var optionsMap = {};

			if(whereMap.$options) {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}
			optionsMap.isShallow = true;

			if(MessageModel.options.automaticPropertyName) {
				whereMap[MessageModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = MessageModel.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return MessageModel.find(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.get('/api/messages/:id', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			whereMap.id = request.params.id;

			if(MessageModel.options.automaticPropertyName) {
				whereMap[MessageModel.options.automaticPropertyName] = authenticator;
			}

			var optionsMap = {};

			if(whereMap.$options) {
				optionsMap = whereMap.$options;
				delete whereMap.$options;
			}

			optionsMap.isShallow = true;

			var accessControl = MessageModel.getAccessControl();
			return Q.when(accessControl.canRead({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canRead) {
					if(canRead) {
						if(typeof canRead == 'object') {
							whereMap = merge(whereMap, canRead);
						}

						return MessageModel.getOne(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.put('/api/messages/:id', function(request, response, app,  MessageModel, UserModel) {
	var accessControl = MessageModel.getAccessControl();
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};

			if(MessageModel.options.automaticPropertyName) {
				whereMap[MessageModel.options.automaticPropertyName] = authenticator;
			}

			whereMap.id = request.params.id;

			return Q.when(accessControl.canUpdate({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canUpdate) {
					if(canUpdate) {
						if(typeof canUpdate == 'object') {
							whereMap = merge(whereMap, canUpdate);
						}

						return [_canUpdateProperties(Object.keys(request.body), MessageModel), whereMap, authenticator];
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		})
		.all()
		.spread(function(canUpdateProperties, whereMap, authenticator) {
			if(canUpdateProperties) {
				return Q.all([MessageModel.updateOne(whereMap, request.body), authenticator]);
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

app.put('/api/messages', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};

			if(MessageModel.options.automaticPropertyName) {
				whereMap[MessageModel.options.automaticPropertyName] = authenticator;
			}

			var accessControl = MessageModel.getAccessControl();
			return Q.when(accessControl.canUpdate({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canUpdate) {
					if(canUpdate) {
						return Q.when(_canUpdateProperties(Object.keys(request.body || {}), MessageModel))
							.then(function(canUpdateProperties) {
								if(canUpdateProperties) {
									if(typeof canUpdate == 'object') {
										whereMap = merge(whereMap, canUpdate);
									}

									return MessageModel.update(whereMap, request.body || {});
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

app.delete('/api/messages', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			if(MessageModel.options.automaticPropertyName) {
				whereMap[MessageModel.options.automaticPropertyName] = authenticator;
			}

			var optionsMap = null;
			if(whereMap.$options) {
                optionsMap = whereMap.$options;
                delete whereMap.$options;
            }

			var accessControl = MessageModel.getAccessControl();
			return Q.when(accessControl.canDelete({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
				.then(function(canDelete) {
					if(canDelete) {
						if(typeof canDelete == 'object') {
							whereMap = merge(whereMap, canDelete);
						}

						return MessageModel.remove(whereMap, optionsMap);
					}
					else {
						throw unauthenticatedError(authenticator);
					}
				});
		});
});

app.delete('/api/messages/:id', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var whereMap = request.query || {};
			whereMap.id = request.params.id;
			if(MessageModel.options.automaticPropertyName) {
				whereMap[MessageModel.options.automaticPropertyName] = authenticator;
			}

			var optionsMap = null;
			if(whereMap.$options) {
                optionsMap = whereMap.$options;
                delete whereMap.$options;
            }

			var accessControl = MessageModel.getAccessControl();
			return Q.when(accessControl.canDelete({authenticator: authenticator, request: request, response: response, whereMap: whereMap}))
			.then(function(canDelete) {
				if(canDelete) {
					if(typeof canDelete == 'object') {
						whereMap = merge(whereMap, canDelete);
					}

					return MessageModel.removeOne(whereMap, optionsMap);
				}
				else {
					throw unauthenticatedError(authenticator);
				}
			});
		});
});







app.post('/api/messages/:id/user', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var property = MessageModel.getProperty('user');
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
			var property = MessageModel.getProperty('user');
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

app.get('/api/messages/:id/user', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var association = MessageModel.getProperty('user');
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

app.delete('/api/messages/:id/user', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var association = MessageModel.getProperty('user');
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

				var association = MessageModel.getProperty('user');
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

app.put('/api/messages/:id/user', function(request, response, app,  MessageModel, UserModel) {
	return findAuthenticator(UserModel, request)
		.then(function(authenticator) {
			var association = MessageModel.getProperty('user');
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












