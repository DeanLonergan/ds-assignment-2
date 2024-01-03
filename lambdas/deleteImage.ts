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

    if (!event.Records) {
        console.log("No images present")
        return
    }

    for (const record of event.Records) {
        const snsMessage = JSON.parse(record.Sns.Message)
        console.log('Raw SNS message ', JSON.stringify(snsMessage))

        if (snsMessage.Records) {
            for (const messageRecord of snsMessage.Records) {
                const s3e = messageRecord.s3;
                const srcBucket = s3e.bucket.name;
                // Object key may have spaces or unicode non-ASCII characters.
                const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
                const commandOutput = await ddbClient.send(
                    new DeleteCommand({
                        TableName: process.env.TABLE_NAME,
                        Key: {
                            imageName: srcKey
                        }
                    })
                );
                console.log("Image Deleted:" + commandOutput)
            }
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