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
      Key: sequenceName, // ex: "TournamentArchers"
      UpdateExpression: "ADD count :inc",
      // UpdateExpression: 'SET count = count + :inc',
      ExpressionAttributeValues: {':val': 1},
      ReturnValues: 'UPDATED_NEW'
    };

    const response = await dynamoDB.send( new UpdateCommand( dbParams ));

    console.log("Responding with updated data: " +  JSON.stringify( response ));

    if (!response || !response.Attributes || !response.Attributes.count) {
      throw new Error("incrementing counter failed");
    }
    return response.Attributes.count;  // here's the new unique ID
  }
};
