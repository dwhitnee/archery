/* jslint esversion: 8 */
//----------------------------------------------------------------------
// Atomic counters for DynamoDB
//
// Emulates the SQL "SELECT mySequence.NEXTVAL"
//
// requires DynamoDB Table Named "AtomicCounters" w/Primary hash key "id"
//----------------------------------------------------------------------

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument, QueryCommand, ScanCommand,
         GetCommand, PutCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const dynamoDB = DynamoDBDocument.from(new DynamoDBClient());

module.exports = {
  //----------------------------------------------------------------------
  // @param sequenceName - which counter to use (in table AtomicCounters)
  // @return the next value in a the named database sequence.
  //
  // @throws if there is any DB error (sequence may or may not have been incremented)
  //----------------------------------------------------------------------
  getNextValueInSequence: async function( sequenceName ) {
    let dbParams = {
      TableName: "AtomicCounters",
      Key: { id: sequenceName },        // ex: "Tournaments"
      UpdateExpression: "ADD #counter :inc",
      ExpressionAttributeNames: { "#counter": "counter" },  // counter is reserved
      ExpressionAttributeValues: {':inc': 1 },
      ReturnValues: 'UPDATED_NEW'
    };

    try {
      console.info( JSON.stringify( dbParams ) );
      const response = await dynamoDB.send( new UpdateCommand( dbParams ));

      console.log("Responding with updated counter: " +  JSON.stringify( response ));
      // if (!response || !response.Attributes || !response.Attributes.count) {
      //   throw new Error("incrementing counter failed");
      // }
      return response.Attributes.counter;  // here's the new unique ID
    }
    catch (e) {
      console.error("Counter failed to increment: " + e );

      // Create sequence maybe? We don't want to reset an existing
      // sequence but the most likely reason for failure is lack of creation...

      // console.info("Creating sequence and trying again: " + sequenceName);
      // await this.createSequence( sequenceName );
      // const response = await dynamoDB.send( new UpdateCommand( dbParams ));
      // return response.Attributes.counter;
    }
    return undefined;
  },

  //----------------------------------------------------------------------
  // must be run once for each sequence needed
  // How to prevent this from being run on an existing sequence?
  //----------------------------------------------------------------------
  createSequence: async function( sequenceName ) {
    let dbParams = {
      TableName: "AtomicCounters",
      Item: { id: sequenceName, counter: 1 }     // ex: "Tournaments"
    };

    try {
      console.info( JSON.stringify( dbParams ) );
      const response = await dynamoDB.send( new PutCommand( dbParams ));
      console.log("Created sequence " + sequenceName );
    }
    catch (e) {
      console.error("Sequence failed to be created: " + e );
    }
  }

};
