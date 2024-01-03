import { SQSHandler } from "aws-lambda";
// import AWS from 'aws-sdk';
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { send } from "process";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error(
        "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
    );
}

const client = new SESClient({ region: SES_REGION });

export const handler: SQSHandler = async (event: any) => {
    console.log("Event ", event);
    for (const record of event.Records) {
        const recordBody = JSON.parse(record.body);
        const snsMessage = JSON.parse(recordBody.Message);

        if (snsMessage.Records) {
            for (const messageRecord of snsMessage.Records) {
                const s3e = messageRecord.s3;
                const srcBucket = s3e.bucket.name;
                const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
                const message = "Invalid file type";
                // Check that the image type is supported
                const splitKey = srcKey.split('.');
                const imageType = splitKey[splitKey.length - 1].toLowerCase();
                if (imageType !== "jpeg" && imageType !== "png") {
                    await sendRejectionEmail(SES_EMAIL_TO, SES_EMAIL_FROM, message);
                }
            }
        }
    }
}

async function sendRejectionEmail(toEmail: string, fromEmail: string, errorMessage: string) {
    const params = {
        Destination: {
            ToAddresses: [toEmail],
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: `There was an error processing your image. \nError message: ${errorMessage}`,
                },
            },
            Subject: {
                Charset: "UTF-8",
                Data: `Error processing your image!`,
            },
        },
        Source: fromEmail,
    };
    await client.send(new SendEmailCommand(params));
}