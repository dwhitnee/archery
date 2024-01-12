//----------------------------------------------------------------------
// Internal DynamoDB functions, not the API
// DB Key is generated here from API calls.
//
// No HTTP here, just Dynamo. Therefore most callbacks just return data
// and no HTTP response stuff.
//----------------------------------------------------------------------

let tableName = "Archers";

module.exports = {

  //----------------------------------------
  // PK is archer name plus year
  //----------------------------------------
  getDBKey: function( userId, year ) {
    return userId + ":" + year;
  },

  //----------------------------------------------------------------------
  // Async, retrieve a single record from DB and invoke callback
  // This is intended to be called internally
  // Params: gameId and callback( error, gameData )
  //----------------------------------------------------------------------
  getRecordByNameAndYear: function( userId, year, callback ) {
    console.log("Getting archer " + userId );

    let id = this.getDBKey( userId, year);

    let dbRequest = {
      TableName : tableName,
      Key: {"id": id }};

    // KeyConditions

    console.log( dbRequest );

    let AWS = require('aws-sdk');
    let dynamoDB = new AWS.DynamoDB.DocumentClient();

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
  // return all archer names (need an index?)
  // Get all records for given year
  //
  //  (optional: &year="2004")
  // Params: callback( err, gameList )
  //----------------------------------------------------------------------
  getArcherList: function( callback ) {

    let someTime = new Date();
    someTime.setDate( someTime.getDate()-1);
    let yesterday = someTime.toISOString();   // "2020-05-05T09:46:26.500Z"

    // FIXME FIXME FIXME FIXME
    // SQL equivalent: "SELECT * from Games WHERE createdDate> "Thu Jan 18 2018"

    // The Index allows us to do this "where" clause.
    // Since this is "NoSQL" this query is impossible without this
    // Index configured on the table ahead of time.

    // The alternative is to scan() all Games and only show the days we want.
    // Or put a secondary/sort index on "day".

    // :values represent variables, without colon is key name (unless reserved)

    let dbRequest = {
      TableName : tableName,
      IndexName: "createdDate-index",
      KeyConditionExpression: "gameOver = :f and createdDate > :yesterday",
      ExpressionAttributeValues: {
        ":yesterday": yesterday,       // "2020-05-04T09:46:26.500Z"
        ":f": "false"
      }
    };

    console.log( dbRequest );

    let AWS = require('aws-sdk');
    let dynamoDB = new AWS.DynamoDB.DocumentClient();

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
  // Params: archerData blob
  // Params: callback( err, data )  success IFF err==null
  //----------------------------------------
  saveRecord: function( data, callback ) {
    let now = new Date();

    //----------------------------------------
    // Create storage record, add timestamp (add sourceIp?)
    //----------------------------------------
    let dbParams = {
      TableName : tableName,
      Item: data
    };

    let id = this.getDBKey( data.userId, data.year);

    dbParams.Item.id = id;   // PK
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

    let AWS = require('aws-sdk');
    let dynamoDB = new AWS.DynamoDB.DocumentClient();

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
  deleteRecord: function( userId, year, callback ) {
    let id = this.getDBKey( userId, year );
    console.log("Permanently Deleting " + id );

    let dbRequest = {
      TableName : tableName,
      Key: {"id": id }};

    let AWS = require('aws-sdk');
    let dynamoDB = new AWS.DynamoDB.DocumentClient();

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
