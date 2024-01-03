/* eslint-disable import/extensions, import/no-absolute-path */
import { SNSHandler } from "aws-lambda";
// import { sharp } from "/opt/nodejs/sharp-utils";
import {
    GetObjectCommand,
    PutObjectCommandInput,
    GetObjectCommandInput,
    S3Client,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const s3 = new S3Client();
const ddbClient = createDDbDocClient();

export const handler: SNSHandler = async (event) => {
    console.log("Event ", event);
    for (const record of event.Records) {

        const recordBody = record.Sns;
        console.log("Record Body => ", recordBody)

        const message = JSON.parse(recordBody.Message)  // Parse the SNS message
        console.log('Raw SNS message ', message)

        for (const mess of message.Records) {   // Process each record in the SNS message
            const key = mess.s3.object.key  // Extract the S3 object key
            console.log("Key =>", key)

            await ddbClient.send(   // Send a command to DynamoDB to delete the record associated with the S3 object key
                new DeleteCommand({
                    TableName: process.env.TABLE_NAME,
                    Key: {
                        fileName: key
                    }
                })
            )
        }
    }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
        wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}