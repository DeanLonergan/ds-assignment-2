import { SQSHandler } from "aws-lambda";
// import AWS from 'aws-sdk';
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error(
        "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
    );
}

const client = new SESClient({ region: SES_REGION });

export const handler: SQSHandler = async (event: any) => {
    console.log("Event ", event);
    for (const record of event.Records) {
        const snsMessage = record.Sns.Message;
        const message = JSON.parse(snsMessage);
        const s3e = message.Records[0].s3;
        const srcBucket = s3e.bucket.name;
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        const messageData = `We have received your File. \nURL: s3://${srcBucket}/${srcKey}`;

        await sendConfirmationEmail(SES_EMAIL_TO, SES_EMAIL_FROM, messageData);
    }
};

async function sendConfirmationEmail(
    to: string,
    from: string,
    message: string
) {
    const params = {
        Destination: {
            ToAddresses: [to],
        },
        Message: {
            Body: {
                Text: { Data: message },
            },
            Subject: { Data: "File uploaded successfully!" },
        },
        Source: from,
    };
    await client.send(new SendEmailCommand(params));
}