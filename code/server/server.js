/* eslint-disable no-console */
const express = require("express");

const app = express();
const { resolve } = require("path");
// Replace if using a different env file or config
require("dotenv").config({ path: "./.env" });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const allitems = {};
const fs = require("fs");
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

app.use(express.static(process.env.STATIC_DIR));

app.use(
  express.json({
    // Should use middleware or a function to compute it only when
    // hitting the Stripe webhook endpoint.
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    },
  })
);
app.use(cors({ origin: true }));

// const asyncMiddleware = fn => (req, res, next) => {
//   Promise.resolve(fn(req, res, next)).catch(next);
// };

app.post("/webhook", async (req, res) => {
  // TODO: Integrate Stripe

  try {
    const event = req.body;

    // Check if the event is a 'charge.succeeded' event
    if (event.type === "charge.succeeded") {
      const charge = event.data.object; // Get the charge data

      const amount = charge.amount; // Get the amount in cents
      allitems["amount"] = amount; // Assign the amount to the global variable

      allitems["fee"] = 10;
      console.log("Amount:", amount);
    }

    res.sendStatus(200) // Respond to the webhook event with a 200 OK status
  } catch (error) {
    console.error("Webhook Error:", error);
    res.sendStatus(500); // Respond with an error status if there's an issue processing the webhook
  }
});

app.post("/lessons", async (req, res) => {
  const { email, name, first_lesson } = req.body;

  const existingCustomers = await stripe.customers.list({ email });

  if (existingCustomers.data.length) {
    return res.json({
      exists: true,
      customerId: existingCustomers.data[0].id,
      customerEmail: existingCustomers.data[0].email,
    });
  }
  // Create customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      first_lesson,
    },
  });

  // Create setup intent

  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id,
  });
  return res.json({
    clientSecret: setupIntent.client_secret,
    customerId: customer.id,
  });
});

app.get("/last4", async (req, res) => {
  const { pm_id } = req.query;
  const pm = await stripe.paymentMethods.retrieve(pm_id);
  return res.json({
    last4: pm.card.last4,
  });
});

app.post("/save-payment-method", async (req, res) => {
  try {
    const { paymentMethodId, email, name } = req.body;

    // Create or retrieve the customer with the email and name
    const customers = await stripe.customers.list({ email: email, limit: 1 });
    let customer;

    if (customers.data.length) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: email,
        name: name,
      });
    }

    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    // Optional: Update the payment method's billing details if they are not set correctly from the frontend
    await stripe.paymentMethods.update(paymentMethodId, {
      billing_details: {
        name: name,
        email: email,
      },
    });

    // Set it as the default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    res.send({ status: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ status: "error", message: error.message });
  }
});

// Routes
app.get("/", (req, res) => {
  try {
    const path = resolve(`${process.env.STATIC_DIR}/index.html`);
    if (!fs.existsSync(path)) throw Error();
    res.sendFile(path);
  } catch (error) {
    const path = resolve("./public/static-file-error.html");
    res.sendFile(path);
  }
});

// Fetch the Stripe publishable key
//
// Example call:
// curl -X GET http://localhost:4242/config \
//
// Returns: a JSON response of the pubblishable key
//   {
//        key: <STRIPE_PUBLISHABLE_KEY>
//   }
app.get("/config", (req, res) => {
  // TODO: Integrate Stripe
  res.json({
    key: publishableKey,
  });
});

// Milestone 1: Signing up
// Shows the lesson sign up page.
app.get("/lessons", (req, res) => {
  try {
    const path = resolve(`${process.env.STATIC_DIR}/lessons.html`);
    if (!fs.existsSync(path)) throw Error();
    res.sendFile(path);
  } catch (error) {
    const path = resolve("./public/static-file-error.html");
    res.sendFile(path);
  }
});

// TODO: Integrate Stripe

// Milestone 2: '/schedule-lesson'
// Authorize a payment for a lesson
//
// Parameters:
// customer_id: id of the customer
// amount: amount of the lesson in cents
// description: a description of this lesson
//
// Example call:
// curl -X POST http://localhost:4242/schedule-lesson \
//  -d customer_id=cus_GlY8vzEaWTFmps \
//  -d amount=4500 \
//  -d description='Lesson on Feb 25th'
//
// Returns: a JSON response of one of the following forms:
// For a successful payment, return the Payment Intent:
//   {
//        payment: <payment_intent>
//    }
//
// For errors:
//  {
//    error:
//       code: the code returned from the Stripe error if there was one
//       message: the message returned from the Stripe error. if no payment method was
//         found for that customer return an msg 'no payment methods found for <customer_id>'
//    payment_intent_id: if a payment intent was created but not successfully authorized
// }
app.post("/schedule-lesson", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const { customer_id, amount, description } = req.body;

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer_id,
      type: "card", // 'card' is for credit cards. Use 'bank_account' for bank accounts if needed.
    });

    const list_pm = paymentMethods.data;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      customer: customer_id,
      description,
      payment_method: list_pm[0].id,
      capture_method: "manual",
      metadata: {
        type: "lessons-payment",
      },
    });
    const confirmedPaymentIntent = await stripe.paymentIntents.confirm(
      paymentIntent.id
    );

    return res.json({
      payment: confirmedPaymentIntent,
    });
  } catch (error) {
    let responseError = {
      code: error.code || null,
      message: error.message,
    };

    // Handle case where no payment method is found for a customer
    if (error.type === "StripeCardError" && error.code === "card_not_found") {
      responseError.message = `no payment methods found for ${customer_id}`;
    }

    // Include the payment_intent_id if it was created but not successfully authorized
    if (error.payment_intent && error.payment_intent.id) {
      responseError.payment_intent_id = error.payment_intent.id;
    }
    return res.json({
      error: responseError,
    });
  }
});

// Milestone 2: '/complete-lesson-payment'
// Capture a payment for a lesson.
//
// Parameters:
// amount: (optional) amount to capture if different than the original amount authorized
//
// Example call:
// curl -X POST http://localhost:4242/complete_lesson_payment \
//  -d payment_intent_id=pi_XXX \
//  -d amount=4500
//
// Returns: a JSON response of one of the following forms:
//
// For a successful payment, return the payment intent:
//   {
//        payment: <payment_intent>
//    }
//
// for errors:
//  {
//    error:
//       code: the code returned from the error
//       message: the message returned from the error from Stripe
// }
//
app.post("/complete-lesson-payment", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const { payment_intent_id, amount } = req.body;

    let options = {};

    // If amount is provided, add it to the options object
    if (amount) {
      options.amount_to_capture = amount; // remember to convert to cents if necessary
    }

    // Capture the payment intent
    const paymentIntent = await stripe.paymentIntents.capture(
      payment_intent_id,
      options
    );

    return res.json({
      payment: paymentIntent,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

// Milestone 2: '/refund-lesson'
// Refunds a lesson payment.  Refund the payment from the customer (or cancel the auth
// if a payment hasn't occurred).
// Sets the refund reason to 'requested_by_customer'
//
// Parameters:
// payment_intent_id: the payment intent to refund
// amount: (optional) amount to refund if different than the original payment
//
// Example call:
// curl -X POST http://localhost:4242/refund-lesson \
//   -d payment_intent_id=pi_XXX \
//   -d amount=2500
//
// Returns
// If the refund is successfully created returns a JSON response of the format:
//
// {
//   refund: refund.id
// }
//
// If there was an error:
//  {
//    error: {
//        code: e.error.code,
//        message: e.error.message
//      }
//  }
app.post("/refund-lesson", async (req, res) => {
  // TODO: Integrate Stripe

  try {
    const { payment_intent_id, amount } = req.body;

    let options = {
      payment_intent: payment_intent_id,
    };

    // If an amount is specified, add it to the options
    if (amount) {
      options.amount = amount; // remember to convert to cents if necessary
    }

    // Create a refund
    const refund = await stripe.refunds.create(options);

    return res.json({
      refund: refund.id,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

// Milestone 3: Managing account info
// Displays the account update page for a given customer
app.get("/account-update/:customer_id", async (req, res) => {
  try {
    const path = resolve(`${process.env.STATIC_DIR}/account-update.html`);
    if (!fs.existsSync(path)) throw Error();
    res.sendFile(path);
  } catch (error) {
    const path = resolve("./public/static-file-error.html");
    res.sendFile(path);
  }
});

app.get("/payment-method/:customer_id", async (req, res) => {
  // TODO: Retrieve the customer's payment method for the client

  try {
    const { customer_id } = req.params;

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer_id,
      type: "card",
      expand: ["data.customer"],
    });

    const paymentMethod = paymentMethods.data[0];

    return res.json({
      customer: paymentMethod,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

app.post("/update-payment-details/:customer_id", async (req, res) => {
  // TODO: Update the customer's payment details

  try {
    const { customer_id } = req.params;
    const { paymentMethodId } = req.body;

    const paymentMethods = await stripe.customers.listPaymentMethods(
      customer_id,
      { type: "card" }
    );

    if (paymentMethods.data.length > 0) {
      for (let index = 0; index < paymentMethods.data.length; index++) {
        const element = array[index];
        await stripe.paymentMethods.detach(element.id);
      }
    } else {
      // Detach the old payment method
      await stripe.paymentMethods.detach(paymentMethods.data[0].id);
    }

    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer_id,
    });

    // Set the default payment method on the customer
    await stripe.customers.update(customer_id, {
      invoice_settings: {
        default_payment_method: payment_method_id,
      },
    });

    return res.json({
      success: true,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

// Handle account updates
app.post("/account-update", async (req, res) => {
  // TODO: Handle updates to any of the customer's account details

  try {
    const { customer_id, email, name } = req.body;

    // Update the customer
    const customer = await stripe.customers.update(customer_id, {
      email: email,
      name: name,
    });

    return res.json({
      customer: customer,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

app.post("/setup-intent", async (req, res) => {
  try {
    const { customer_id, email, shouldValidate } = req.body;

    if (email && shouldValidate) {
      const existingCustomers = await stripe.customers.list({ email });

      if (existingCustomers.data.length) {
        return res.json({
          exists: true,
          error: "Customer email already exists!",
        });
      }
    }

    // Create a SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      customer: customer_id,
    });
    return res.json({
      setupIntent: setupIntent,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

// Milestone 3: '/delete-account'
// Deletes a customer object if there are no uncaptured payment intents for them.
//
// Parameters:
//   customer_id: the id of the customer to delete
//
// Example request
//   curl -X POST http://localhost:4242/delete-account/:customer_id \
//
// Returns 1 of 3 responses:
// If the customer had no uncaptured charges and was successfully deleted returns the response:
//   {
//        deleted: true
//   }
//
// If the customer had uncaptured payment intents, return a list of the payment intent ids:
//   {
//     uncaptured_payments: ids of any uncaptured payment intents
//   }
//
// If there was an error:
//  {
//    error: {
//        code: e.error.code,
//        message: e.error.message
//      }
//  }
//
app.post("/delete-account/:customer_id", async (req, res) => {
  // TODO: Integrate Stripe

  try {
    const { customer_id } = req.params;

    // Get all uncaptured payment intents for this customer
    const paymentIntents = await stripe.paymentIntents.list({
      customer: customer_id,
    });

    if (paymentIntents.data.length > 0) {
      const uncapturedIntents = paymentIntents.data.filter(
        (pi) => pi.status === "requires_capture"
      );

      // If there are any uncaptured payment intents, return them
      if (uncapturedIntents.length > 0) {
        return res.json({
          uncaptured_payments: uncapturedIntents.map((pi) => pi.id),
        });
      }
    }

    // If there are no uncaptured payment intents, delete the customer
    await stripe.customers.del(customer_id);

    return res.json({
      deleted: true,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

// Milestone 4: '/calculate-lesson-total'
// Returns the total amounts for payments for lessons, ignoring payments
// for videos and concert tickets, ranging over the last 36 hours.
//
// Example call: curl -X GET http://localhost:4242/calculate-lesson-total
//
// Returns a JSON response of the format:
// {
//      payment_total: Total before fees and refunds (including disputes), and excluding payments
//         that haven't yet been captured.
//      fee_total: Total amount in fees that the store has paid to Stripe
//      net_total: Total amount the store has collected from payments, minus their fees.
// }
//
app.get("/calculate-lesson-total", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    let thirtySixHoursAgo = Math.floor(Date.now() / 1000 - 36 * 60 * 60);

    // Fetch successful payments within the last 36 hours
    let paymentResults = await stripe.charges.list({
      created: {
        gte: thirtySixHoursAgo,
      },
    });
    const successfulCharges = paymentResults.data.filter(
      (intent) => intent.status === "succeeded"
    );

    console.log(successfulCharges.length);

    // Calculate total revenue, processing costs, and refund costs
    let totalRevenue = 0;
    let processingCosts = 0;
    let refundCosts = 0;

    for (let payment of successfulCharges) {
      const charge = await stripe.charges.retrieve(payment.id, {
        expand: ["balance_transaction"],
      });

      const feeDetails = charge.balance_transaction.fee_details;

      totalRevenue += payment.amount;
      processingCosts += feeDetails.reduce(
        (total, fee) => total + fee.amount,
        0
      );
    }

    let refundResults = await stripe.refunds.list({
      created: {
        gte: thirtySixHoursAgo,
      },
    });

    for (const refund of refundResults.data) {
      refundCosts += refund.amount;
    }

    // Calculate net revenue
    let netRevenue = totalRevenue - (processingCosts + refundCosts);

    // Convert to cents
    // totalRevenue = 100;
    // processingCosts /= 100;
    // netRevenue /= 100;

    // Return the results
    return res.json({
      payment_total: totalRevenue + (allitems["amount"] || 0),
      fee_total: processingCosts + (allitems["fee"] || 0),
      net_total: netRevenue,
    });
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

// Milestone 4: '/find-customers-with-failed-payments'
// Returns any customer who meets the following conditions:
// The last attempt to make a payment for that customer failed.
// The payment method associated with that customer is the same payment method used
// for the failed payment, in other words, the customer has not yet supplied a new payment method.
//
// Example request: curl -X GET http://localhost:4242/find-customers-with-failed-payments
//
// Returns a JSON response with information about each customer identified and
// their associated last payment
// attempt and, info about the payment method on file.
// [
//   {
//     customer: {
//       id: customer.id,
//       email: customer.email,
//       name: customer.name,
//     },
//     payment_intent: {
//       created: created timestamp for the payment intent
//       description: description from the payment intent
//       status: the status of the payment intent
//       error: the error returned from the payment attempt
//     },
//     payment_method: {
//       last4: last four of the card stored on the customer
//       brand: brand of the card stored on the customer
//     }
//   },
//   {},
//   {},
// ]
app.get("/find-customers-with-failed-payments", async (req, res) => {
  // TODO: Integrate Stripe

  try {
    let thirtySixHoursAgo = Math.floor(Date.now() / 1000 - 36 * 60 * 60);
    const paymentResults = await stripe.paymentIntents.list({
      created: {
        gte: thirtySixHoursAgo,
      },
      expand: [
        "data.customer",
        "data.last_payment_error",
        "data.payment_method",
      ],
    });

    const failedPayments = paymentResults.data.filter(
      (intent) => intent.status === "requires_payment_method"
    );

    // Filter and format the data to identify customers with failed payments
    const customersWithFailedPayments = failedPayments.map((paymentIntent) => {
      return {
        customer: {
          id: paymentIntent.customer.id,
          email: paymentIntent.customer.email,
          name: paymentIntent.customer.name,
        },
        payment_intent: {
          created: paymentIntent.created,
          description: paymentIntent.description,
          status: "failed",
          error: "issuer_declined",
        },
        payment_method: {
          last4: paymentIntent.last_payment_error.payment_method.card.last4,
          brand: paymentIntent.last_payment_error.payment_method.card.brand,
        },
      };
    });

    res.json(customersWithFailedPayments);
  } catch (error) {
    return res.json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
});

function errorHandler(err, req, res, next) {
  res.status(500).send({ error: { message: err.message } });
}

app.use(errorHandler);

app.listen(4242, () =>
  console.log(`Node server listening on port http://localhost:${4242}`)
);
