import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imageTable = new dynamodb.Table(this, "ImagesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "imageName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Images",
    })

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imageDeadLetterQueue = new sqs.Queue(this, "dead-letter-queue", {
      queueName: "dead-letter-queue",
      retentionPeriod: cdk.Duration.minutes(15),
    });

    // Output
    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: imageDeadLetterQueue,
        maxReceiveCount: 1,
      }
    });

    const imageTopic = new sns.Topic(this, "ImageTopic", {
      displayName: "Image topic",
    });

    const deleteImageTopic = new sns.Topic(this, "deleteImageTopic", {
      displayName: "Delete Image topic",
    });

    // Lambda functions

    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        // architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName
        }
      }
    );

    const deleteImageFn = new lambdanode.NodejsFunction(
      this,
      "DeletImageFn",
      {
        // architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/deleteImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName
        }
      }
    );

    const updateImageFn = new lambdanode.NodejsFunction(
      this,
      "UpdateImageFn",
      {
        // architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/updateImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName
        }
      }
    );

    const confirmationMailerFn = new lambdanode.NodejsFunction(this, "confirmation-mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/confirmationMailer.ts`,
    });

    const rejectionMailerFn = new lambdanode.NodejsFunction(this, "rejection-mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
    });

    // Event triggers

    // When a new object is created in the S3 bucket
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,  // Event type (object creaton)
      new s3n.SnsDestination(imageTopic)  // Notify the specified SNS topic when an event occurs
    );

    // When an object is removed from the S3 bucket
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,  // Event type (object removal)
      new s3n.SnsDestination(imageTopic)
    )

    // triggered by messages in the imageDeadLetterQueue
    rejectionMailerFn.addEventSource(new events.SqsEventSource(imageDeadLetterQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
      maxConcurrency: 5,
    }));

    // Creates an SQS event source for the imageProcessQueue
    const newImageMailEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    });

    // Triggered by messages in the imageProcessQueue
    processImageFn.addEventSource(newImageMailEventSource);

    // Subscriptions

    // https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering.html#
    imageTopic.addSubscription(
      new subs.LambdaSubscription(deleteImageFn,{ // Define a filter policy based on the message body
        filterPolicyWithMessageBody: {  // Filters for messages where the event name indicates an object removal
          Records: sns.FilterOrPolicy.policy({
            eventName: sns.FilterOrPolicy.filter(
              sns.SubscriptionFilter.stringFilter({
                matchPrefixes: ['ObjectRemoved']  // Only trigger for events that start with ObjectRemoved
              })
            )
          })
        }
      } )
    );

    imageTopic.addSubscription(
      new subs.LambdaSubscription(updateImageFn, {
        filterPolicy: {
          object_name: sns.SubscriptionFilter.stringFilter({
            matchPrefixes: ['fileName'] // Only trigger for messages where the object_name attribute starts with 'fileName'.
          })
        }
      })
    )

    imageTopic.addSubscription(
      new subs.LambdaSubscription(confirmationMailerFn)
    );

    imageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue),
    );

    deleteImageTopic.addSubscription(
      new subs.LambdaSubscription(deleteImageFn)
    );

    // Permissions

    imagesBucket.grantRead(processImageFn);
    imageTable.grantReadWriteData(processImageFn);
    imageTable.grantReadWriteData(deleteImageFn);
    imageTable.grantReadWriteData(updateImageFn);
    imageDeadLetterQueue.grantConsumeMessages(rejectionMailerFn);

    confirmationMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    rejectionMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    // Output

    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
  }
}