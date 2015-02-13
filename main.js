var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases()

	fakeDemo();

}


function fakeDemo()
{
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary =
{
	pathExists:
	{
		'path/fileExists': {},
	},
	fileWithContent:
	{
		pathContent:
		{
  			file1: 'text content',
				file2: 'text content 2'
		}
	},
	fileWithoutContent:
	{
		pathContent:
		{
			file2: '',

		}
	}
};

function generateTestCases()
{

	var content = "var subject = require('./subject.js')\nvar mock = require('mock-fs');\nvar faker = require('faker')\n";
	for ( var funcName in functionConstraints )
	{
		var params = {};

		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			//params[paramName] = '\'' + faker.phone.phoneNumber()+'\'';
			params[paramName] = '\'\'';
		}

		//console.log( params );

		var containsPhone = _.contains(functionConstraints[funcName].params, "phoneNumber");
		console.log('containsPhone ' + containsPhone);

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {mocking: 'fileWithContent' });
		var pathExists      = _.some(constraints, {mocking: 'fileExists' });

		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				params[constraint.ident] = constraint.value;
				var args = _.map(params, function(value, key, list){
					return value;
				}).join(",");
				content += "subject.{0}({1});\n".format(funcName, args );
			}
		}



		// var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
		// Prepare function arguments.
		if( pathExists || fileWithContent )
		{
			content += generateMockFsTestCases(pathExists,fileWithContent,funcName, args);
			// Bonus...generate constraint variations test cases....
			content += generateMockFsTestCases(!pathExists,!fileWithContent,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,funcName, args);
			content += generateMockFsTestCases(!pathExists,fileWithContent,funcName, args);
		} else if(containsPhone){
			for(var i = 0; i<2; i++){
					for(param in params){
						if(param.indexOf('phoneNumber') > -1){
							// var number = faker.phone.phoneNumberFormat()
							params[param] = "faker.phone.phoneNumberFormat()";
							console.log("number=" + params[param]);
						}
					}

					var args = _.map(params, function(value, key, list){
						return value;
					}).join(",");
					console.log('----->>>' + args);
					content += "subject.{0}({1});\n".format(funcName, args );
			}
			for(param in params){
				if(param.indexOf('phoneNumber') > -1){
					// var number = "212-212-212";
					params[param] = "'212-867-756'";
					console.log("number=" + params[param]);
				}
				var args = _.map(params, function(value, key, list){
					return value;
				}).join(",");
				console.log('----->>>' + args);
				content += "subject.{0}({1});\n".format(funcName, args );
			}
		}
		else
		{
			// Emit simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
		}

	}


	fs.writeFileSync('test.js', content, "utf8");

}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args)
{
	var testCase = "";
	// Insert mock data based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists)
		{
			mergedFS[attrname] = mockFileLibrary.pathExists[attrname];
		}
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent)
		{
			mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname];
		}
	} else{
		for(var attrname in mockFileLibrary.fileWithoutContent){
			mergedFS[attrname] = mockFileLibrary.fileWithoutContent[attrname];
		}
	}


	testCase +=
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node)
	{
		if (node.type === 'FunctionDeclaration')
		{
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						//var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])
						functionConstraints[funcName].constraints.push(
							{
								ident: child.left.name,
								value: rightHand
							});

						if(rightHand == 'undefined'){
							functionConstraints[funcName].constraints.push({
								ident: child.left.name,
								value: '2'
							});
						}
					}
				}

				if(child.type == 'BinaryExpression' && child.operator == "<"){
					if(child.left.type == 'Identifier' && params.indexOf(child.left.name) > -1){
						var rightHand = buf.substring(child.right.range[0], child.right.range[1]);
						functionConstraints[funcName].constraints.push({
							ident: child.left.name,
							value: rightHand
						});

						if(child.right.type == 'Literal'){
							functionConstraints[funcName].constraints.push({
								ident: child.left.name,
								value: child.right.value-1
							});
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push(
							{
								// A fake path to a file
								ident: params[p],
								value: "'pathContent/file1'",
								mocking: 'fileWithContent'
							});

							functionConstraints[funcName].constraints.push({
								ident: params[p],
								value: "'pathContent/file2'",
								mocking: 'fileWithoutContent'
							});

							// functionConstraints[funcName].constraints.push({
							// 	ident: params[p],
							// 	value: "''"
							// });
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push(
							{
								// A fake path to a file
								ident: params[p],
								value: "'path/fileExists'",
								mocking: 'fileExists'
							});
						}
					}
				}

			});

			console.log( functionConstraints[funcName]);

		}
	});
}

function traverse(object, visitor)
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();
