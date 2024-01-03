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
import { UpdateCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const s3 = new S3Client();
const ddbClient = createDDbDocClient();

export const handler: SNSHandler = async (event) => {
  console.log("Event ", event);
  for (const record of event.Records) {
    const recordBody = record.Sns;
    console.log("Record Body => ", recordBody)
    const message = JSON.parse(recordBody.Message)
    console.log('Raw SNS message ',message)
        await ddbClient.send(
            new UpdateCommand(
                {
                    TableName: process.env.TABLE_NAME,
                    Key: {
                        fileName: message.name
                    },
                    UpdateExpression: "set content = :content",
                    ExpressionAttributeValues: {
                        ":content": message.description
                    }
                }
            )
          )
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