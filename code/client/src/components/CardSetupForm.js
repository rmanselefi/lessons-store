import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import React, { useState } from "react";
import SignupComplete from "./SignupComplete";

const CardSetupForm = (props) => {
  const {
    selected,
    mode,
    details,
    customerId,
    learnerEmail,
    learnerName,
    onSuccessfulConfirmation,
  } = props;
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [last4, setLast4] = useState("");
  // TODO: Integrate Stripe
  const stripe = useStripe();
  const elements = useElements();

  const handleClick = async (e) => {
    // TODO: Integrate Stripe
    setProcessing(true);
    if (mode === "setup") {
      const { setupIntent, error } = await stripe.confirmSetup({
        elements,
        setup_intent_data: { metadata: { customerId } },
        redirect: "if_required",
      });

      if (error) {
        setError(error.message);
      } else if (setupIntent && setupIntent.status === "succeeded") {
        const pm_id = setupIntent.payment_method;
        const res = await fetch(`http://localhost:4242/last4?pm_id=${pm_id}`);
        const response = await res.json();

        if (response) {
          setLast4(response.last4);
        }

        await fetch("http://localhost:4242/save-payment-method", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: learnerEmail,
            name: learnerName,
            paymentMethodId: pm_id,
          }),
        });

        setPaymentSucceeded(true);

        if (onSuccessfulConfirmation) {
          onSuccessfulConfirmation(setupIntent);
        }
      }
    } else if (mode === "update") {
      const { setupIntent, error } = await stripe.confirmSetup({
        elements,
        setup_intent_data: { metadata: { customerId } },
        redirect: "if_required",
      });
      if (error) {
        setError(error.message);
      } else if (setupIntent && setupIntent.status === "succeeded") {
        const pm_id = setupIntent.payment_method;
        const res = await fetch(
          `http://localhost:4242/update-payment-details/${customerId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              paymentMethodId: pm_id,
            }),
          }
        );
        const response = await res.json();
        if (response) {
          setLast4(response.last4);
        }
        if (learnerEmail !== "" && learnerName !== "") {
          await fetch("http://localhost:4242/account-update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: learnerEmail,
              name: learnerName,
              customer_id: customerId,
            }),
          });
        }

        setPaymentSucceeded(true);
        if (onSuccessfulConfirmation) {
          onSuccessfulConfirmation(setupIntent);
        }
      }
    }
    setProcessing(false);
  };

  if (selected === -1) return null;
  if (paymentSucceeded)
    return (
      <div className={`lesson-form`}>
        <SignupComplete
          active={paymentSucceeded}
          email={learnerEmail}
          last4={last4}
          customer_id={customerId}
        />
      </div>
    );
  return (
    // The actual checkout form, inside the !paymentSucceeded clause
    <div className={`lesson-form`}>
      <div className={`lesson-desc`}>
        <h3>Registration details</h3>
        <div id="summary-table" className="lesson-info">
          {details}
        </div>
        <div className="lesson-legal-info">
          Your card will not be charged. By registering, you hold a session slot
          which we will confirm within 24 hrs.
        </div>
        <div className="lesson-grid">
          <div className="lesson-inputs">
            <div className="lesson-input-box first">
              <span>
                {learnerName} ({learnerEmail})
              </span>
            </div>
            <div className="lesson-payment-element">
              {
                // TODO: Integrate Stripe
                stripe && elements && (
                  <div>
                    <PaymentElement />
                    {mode === "setup" ? (
                      <button
                        disabled={processing || !stripe || !elements}
                        id="submit"
                        onClick={handleClick}
                      >
                        <span id="button-text">
                          {processing ? (
                            <div className="spinner" id="spinner"></div>
                          ) : (
                            "Pay now"
                          )}
                        </span>
                      </button>
                    ) : (
                      <button
                        disabled={processing || !stripe || !elements}
                        id="submit"
                        onClick={handleClick}
                      >
                        <span id="button-text">
                          {processing ? (
                            <div className="spinner" id="spinner"></div>
                          ) : (
                            "Update Payment Details"
                          )}
                        </span>
                      </button>
                    )}
                  </div>
                )
              }
            </div>
          </div>
        </div>
        {error && (
          <div className="sr-field-error" id="card-errors" role="alert">
            <div className="card-error" role="alert">
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default CardSetupForm;
