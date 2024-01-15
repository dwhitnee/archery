/*jslint node: true, esversion: 6 */
//----------------------------------------------------------------------
// Base Internal DynamoDB functions, not the API
//
// Uses Get() - requires a hash key
// Query() - requires hash and range key (or secondary Global Index)
// Scan() - requires only a filter

// Delete and Update require hash keys
//----------------------------------------------------------------------

// Do these need to go in function calls? FIXME
let AWS = require('aws-sdk');
let dynamoDB = new AWS.DynamoDB.DocumentClient();

module.exports = {

  //----------------------------------------
  // get one data blob by single key
  //
  // @param tableName - DB tableName
  // @param id - the PK (hash key)
  //----------------------------------------
  getRecordById: function( tableName, id, callback ) {
    console.log("Getting " + tableName + ": " + id );

    let dbRequest = {
      TableName : tableName,
      Key: {"id": id }};

    // KeyConditions

    console.log( dbRequest );

    // let AWS = require('aws-sdk');
    // let dynamoDB = new AWS.DynamoDB.DocumentClient();

    dynamoDB.get( dbRequest, function( err, data ) {
      if (err) {
        console.log("DynamoDB error: " + err );
        callback( err );
      } else if (!data.Item) {  // no data returns undefined, not an object
        callback( null, {} );   // return empty object instead
      } else {
        callback( null, data.Item );
      }
    });
  },


  //----------------------------------------------------------------------
  // Retrieve a list of records from DB and invoke callback
  // This is intended to be wrapped and called internally
  //
  // arg ":values" represent variables, without colon is key name (unless reserved)
  //
  // @param tableName - DB table
  // @param query - ex: "id = :id and year = :year";
  // @param args for query - ex: { ':id': 'id', ':year': year };
  // @param callback - node style callback( err, data )
  //----------------------------------------------------------------------
  getRecordByQuery: function( tableName, query, args, callback ) {
    console.log("Querying " + tableName + ": " + args);

    let dbRequest = {
      TableName : tableName,
      KeyConditionExpression: query,
      ExpressionAttributeValues: args
    };

    console.log( dbRequest );

    // let AWS = require('aws-sdk');
    // let dynamoDB = new AWS.DynamoDB.DocumentClient();

    dynamoDB.query( dbRequest, function( err, data ) {
      if (err) {
        console.log("DynamoDB error: " + err );
        callback( err );
      } else if (!data.Item) {  // no data returns undefined, not an object
        callback( null, {} );   // return empty object instead
      } else {
        callback( null, data.Item );
      }
    });
  },


  //----------------------------------------------------------------------
  // Retrieve a list of records from DB and invoke callback
  // This is intended to be wrapped and called internally
  // https://dynobase.dev/dynamodb-filterexpression/
  //
  // arg ":values" represent variable values, without colon is key name (unless reserved)
  // arg "#var" is used in functions as named variables, ex:
  //  FilterExpression : "contains(#name, :name) AND #projectId = :projectId

  // @param tableName - DB table
  // @param filter - ex: "id = :id and year = :year";
  // @param argNames for filter - ex: { "#coach": "coach" }   only needed for filter funcs
  // @param args for filter - ex: { ':id': 'id', ':year': year };
  // @param callback - node style callback( err, data )
  //----------------------------------------------------------------------
  getAllRecordByFilter: function( tableName, filter, argNames, args, callback ) {
    console.log("Querying " + tableName + ": " + args);

    let dbRequest = {
      TableName: tableName,
      FilterExpression: filter,
      ExpressionAttributeNames: argNames,
      ExpressionAttributeValues: args
    };

    console.log( dbRequest );

    // let AWS = require('aws-sdk');
    // let dynamoDB = new AWS.DynamoDB.DocumentClient();

    dynamoDB.scan( dbRequest, function( err, data ) {
      if (err) {
        console.log("DynamoDB error: " + err );
        callback( err );
      } else if (!data.Item) {  // no data returns undefined, not an object
        callback( null, {} );   // return empty object instead
      } else {
        callback( null, data.Item );
      }
    });
  },



  //----------------------------------------------------------------------
  // return all records (need an index?)
  //
  // @param full Dynamo query - too complex to make generel
  // Params: callback( err, gameList )
  //----------------------------------------------------------------------
  getRecordsBySecondaryIndex: function( tableName, indexName, query, args, callback ) {

    // let someTime = new Date();
    // someTime.setDate( someTime.getDate()-1);
    // let yesterday = someTime.toISOString();   // "2020-05-05T09:46:26.500Z"

    // // SQL equivalent: "SELECT * from Games WHERE createdDate> "Thu Jan 18 2018"

    // // The Index allows us to do this "where" clause.
    // // Since this is "NoSQL" this query is impossible without this
    // // Index configured on the table ahead of time.

    // // The alternative is to scan() all Games and only show the days we want.
    // // Or put a secondary/sort index on "day".

    // // :values represent variables, without colon is key name (unless reserved)

    let dbRequest = {
      TableName : tableName,
      IndexName: indexName, // "createdDate-index",
      KeyConditionExpression: query, //  "gameOver = :f and createdDate > :yesterday",
      ExpressionAttributeValues: args,
      // {
      //   ":yesterday": yesterday,       // "2020-05-04T09:46:26.500Z"
      //   ":f": "false"
      // }
    };

    console.log( dbRequest );

    // let AWS = require('aws-sdk');
    // let dynamoDB = new AWS.DynamoDB.DocumentClient();

    dynamoDB.query( dbRequest, function( err, data ) {
      if (err) {
        console.log("DynamoDB error:" + err );
        callback( err );
      } else {
        callback( null, data.Items );  // no data is an empty list
      }
    });
  },


  //----------------------------------------
  // Some action occured, let's store the effect in DynamoDB
  // Optimistically lock on a versionId.  Fail if conflict
  //
  // @param: tableName - DB table
  // @param: id - PK
  // @param: data - blob to save
  // Params: callback( err, data )  success IFF err==null
  //----------------------------------------
  saveRecord: function( tableName, id, data, callback ) {
    let now = new Date();

    //----------------------------------------
    // Create storage record, add timestamp (add sourceIp?)
    //----------------------------------------
    let dbParams = {
      TableName : tableName,
      Item: data
    };

    if (id) {
      dbParams.Item.id = id;   // PK, not sure why it would be different
    }
    dbParams.Item.updatedDate = now.toISOString();

    // optimistic locking  TEST ME
    // Make sure version # has not been incremented since last read
    if (data.version) {
      dbParams.ConditionExpression = "version = :oldVersion";
      dbParams.ExpressionAttributeValues = {
        ":oldVersion" : data.version
      };
      data.version++;   // write new version of data
    } else {
      data.version = 1;   // first write
    }

    if (!dbParams.Item.createdDate) {
      dbParams.Item.createdDate = now.toISOString();  // can't update keys
    }

    console.log("PUT request: " +  JSON.stringify( dbParams ));

    // let AWS = require('aws-sdk');
    // let dynamoDB = new AWS.DynamoDB.DocumentClient();

    // Put and not Update, we want to clobber old entry
    dynamoDB.put( dbParams, function( err, data ) {
      if (err) {
        console.log("DynamoDB error:" + err );
        callback( err );
      } else {
        callback( null );  // success! Nothing to report
      }
    });
  },

  //----------------------------------------
  // Wipe record out
  // Params: gameId
  //----------------------------------------
  deleteRecord: function( tableName, id, callback ) {
    console.log("Permanently Deleting " + id );

    let dbRequest = {
      TableName : tableName,
      Key: {"id": id }};

    // let AWS = require('aws-sdk');
    // let dynamoDB = new AWS.DynamoDB.DocumentClient();

    dynamoDB.delete( dbRequest, function( err, data ) {
      if (err) {
        console.log("DynamoDB error:" + err );
        callback( err );
      } else {
        callback( null );
      }
    });
  },

  // can I update IFF version = V
/*
  updateGameData: function() {
    response = dynamodb.update_item(
      TableName="euchreGames",
      Key={
        'gameId':{'S': "abdefg"}
      },
      UpdateExpression='SET version = version + :inc',
      ExpressionAttributeValues = {
        ':inc': {'N': '1'}
      },
      ReturnValues="UPDATED_NEW"
  }
*/



};
