import React, { useState, useEffect } from "react";
import { db, storage } from "../config/firebase"; // Import Firebase instance
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  getDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"; // Firebase storage methods
import { useAuth } from "../hooks/useAuth"; // Import useAuth hook to access authenticated user
import { useNavigate } from "react-router-dom";
import "../styling/ReportFoundItem.css";

function ReportFoundItem() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [code, setCode] = useState("");
  const [otherCategory, setOtherCategory] = useState("");

  const [timeFound, setTimeFound] = useState("");
  const [brand, setBrand] = useState("");
  const [objectName, setObjectName] = useState("");
  const [color, setColor] = useState("");
  const [otherColor, setOtherColor] = React.useState("");

  const [dateFound, setDateFound] = useState("");
  const [locationFound, setLocationFound] = useState("");
  const [image, setImage] = useState(null); // Store image locally
  const [imageUrl, setImageUrl] = useState(""); // To store the download URL
  const [uploading, setUploading] = useState(false); // To track upload status
  const [confirmed, setConfirmed] = useState(false); // To track code confirmation status
  const [docId, setDocId] = useState("");
  const [generatedCode, setGeneratedCode] = useState(""); // Store the generated code for display
  const { user, isLoading } = useAuth(); // Get the authenticated user's data and loading state
  const [codeExpired, setCodeExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  /**useEffect(() => {
        if (user) {
            //console.log('Authenticated user:', user);
        }
    }, [user]); **/

  // Check for loading or unauthenticated user
  if (isLoading) {
    return <div>Loading...</div>; // Add a loading state to ensure you're not trying to access the user too early
  }

  if (!user) {
    return <div>User not authenticated. Please log in.</div>;
  }

  // Function to generate a code and handle auto-deletion after 30 seconds
  const generateCode = async () => {
    const generatedCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    setGeneratedCode(generatedCode);
    setCodeExpired(false); // Reset expired status on new generation
    setTimeLeft(30); // Reset countdown
    setConfirmed(false); // Reset confirmation status
    const now = new Date();
    const fullDateTime = now.toLocaleString(); // e.g., "10/17/2024, 10:51 PM"

    const initialData = {
      code: generatedCode,
      confirmed: false,
      createdAt: fullDateTime, // Current date and time in ISO format
    };

    try {
      const docRef = await addDoc(
        collection(db, "users", user.id, "itemReports"),
        initialData
      );
      setDocId(docRef.id);

      // Start countdown and check confirmation every second
      const interval = setInterval(async () => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            clearInterval(interval); // Stop interval once timer hits 0
            // If the code is not confirmed when the timer hits 0, expire it
            expireCode(docRef.id);
          }
          return prevTime - 1;
        });

        // Continuously check if the code is confirmed
        const snapshot = await getDoc(
          doc(db, "users", user.id, "itemReports", docRef.id)
        );
        if (snapshot.exists() && snapshot.data().confirmed) {
          clearInterval(interval); // Stop countdown if code is confirmed
          setConfirmed(true); // Code confirmed
          setCodeExpired(false); // Code should not expire
        }
      }, 1000); // Check every second
    } catch (error) {
      console.error("Error generating or deleting code:", error);
    }
  };

  // Function to expire the code
  const expireCode = async (docId) => {
    try {
      const snapshot = await getDoc(
        doc(db, "users", user.id, "itemReports", docId)
      );
      if (snapshot.exists() && !snapshot.data().confirmed) {
        await deleteDoc(doc(db, "users", user.id, "itemReports", docId));
        setCodeExpired(true); // Mark code as expired
      }
    } catch (error) {
      console.error("Error expiring code:", error);
    }
  };

  // Generate code once the user reaches step 3
  useEffect(() => {
    if (step === 4 && !code) {
      generateCode();
    }
  }, [step, code]);

  // Real-time confirmation status listener
  useEffect(() => {
    if (step === 4 && docId) {
      console.log(
        "Listening to Firestore path:",
        `users/${user.id}/itemReports/${docId}`
      );

      // Listen for real-time updates on the 'FoundItems' document with the Firestore-generated document ID
      const docRef = doc(db, "users", user.id, "itemReports", docId); // Use the Firestore-generated document ID
      const unsubscribe = onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          console.log("Received data:", data);
          if (data && data.confirmed && !confirmed) {
            setConfirmed(true);
            submitFullForm(); // Automatically submit form when confirmed
            console.log(
              "Form data automatically sent after admin confirmation"
            );
          }
        } else {
          console.log("Document does not exist.");
        }
      });

      return () => unsubscribe(); // Cleanup listener
    }
  }, [step, docId, confirmed]);

  // Handle image upload
  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    const storageRef = ref(storage, `itemReports/${code}/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Upload is ${progress}% done`);
      },
      (error) => {
        console.error("Error uploading image:", error);
        setUploading(false);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          setImageUrl(downloadURL);
          setUploading(false);
          console.log("Image available at:", downloadURL);
        });
      }
    );
  };

  // Handle image change
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImage(file);
    handleImageUpload(file);
  };

  // Submit the full form to Firestore after confirmation
  const submitFullForm = async () => {
    const formData = {
      category: category === "Other" ? otherCategory : category,
      contactNumber: user?.contact,
      name: user?.name,
      email: user?.email,
      objectName,
      brand,
      color,
      dateFound,
      timeFound,
      locationFound,
      imageUrl, // Store the download URL of the image
      confirmed: true,
      status: "lost",
      type: "Found",
    };

    try {
      // Use the Firestore-generated document ID (docId) instead of code
      const docRef = doc(db, "users", user.id, "itemReports", docId); // Correct path with Firestore document ID (docId)
      console.log("Submitting form for document ID:", docId);
      await setDoc(docRef, formData, { merge: true }); // Update the document with the full form data
      console.log(
        "Full form data submitted to Firestore under the user's itemReports subcollection."
      );
    } catch (error) {
      console.error("Error submitting form data:", error);
    }
  };

  // Move to the next step
  const nextStep = async () => {
    if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      if (confirmed) {
        setStep(5); // Proceed to step 5 only if the code is confirmed
      } else {
        alert(
          "Your code is not yet confirmed by the admin. Please wait for confirmation."
        );
      }
    } else {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  return (
    <div className="report-found-item-container">
      {step === 1 && (
        <div className="step1">
          <h2>REPORT A FOUND ITEM</h2>
          <p> Terms and Conditions</p>
          <label>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={() => setTermsAccepted(!termsAccepted)}
            />
            I understand and agree.
          </label>
          <button
            onClick={() => {
              navigate("/homepage"); // Navigates to the specified route
              setTimeout(() => {
                // Scroll to slightly above the bottom of the page
                const scrollOffset = 1800; // Adjust this value to change the scroll distance
                window.scrollTo(0, document.body.scrollHeight - scrollOffset);
              }, 100); // Delay in milliseconds before the scroll action is executed
            }}
          >
            Return to homepage
          </button>
          <button disabled={!termsAccepted} onClick={nextStep}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="step2">
          <h2>REPORT A FOUND ITEM</h2>
          <h3>Step 2: Choose Category</h3>
          <form>
            <label>
              <input
                type="radio"
                name="category"
                value="Personal Belonging"
                checked={category === "Personal Belonging"}
                onChange={(e) => setCategory(e.target.value)}
              />
              Personal Belonging (Wallet, Bag, etc.)
            </label>
            <label>
              <input
                type="radio"
                name="category"
                value="Electronics"
                checked={category === "Electronics"}
                onChange={(e) => setCategory(e.target.value)}
              />
              Electronics (Phones, Laptop, etc.)
            </label>
            <label>
              <input
                type="radio"
                name="category"
                value="Documents"
                checked={category === "Documents"}
                onChange={(e) => setCategory(e.target.value)}
              />
              Documents (ID, Cards, etc.)
            </label>
            <label>
              <input
                type="radio"
                name="category"
                value="Other"
                checked={category === "Other"}
                onChange={(e) => setCategory(e.target.value)}
              />
              Other (Specify)
              {category === "Other" && (
                <input
                  type="text"
                  placeholder="Other category"
                  value={otherCategory}
                  onChange={(e) => setOtherCategory(e.target.value)}
                  required // Ensure this field is mandatory when "Other" is selected
                />
              )}
            </label>
          </form>
          <button onClick={prevStep}>Previous</button>
          <button
            onClick={nextStep}
            disabled={!category || (category === "Other" && !otherCategory)} // Disable button if "Other" is selected and no input is provided
          >
            Next{" "}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="step3">
          <h2>REPORT A FOUND ITEM</h2>
          <h3>Response Form</h3>
          <label htmlFor="NameInp">Name:</label>
          <input
            type="text"
            id="NameInp"
            value={user?.name}
            readOnly
            required
          />
          <label htmlFor="EmailInp">Email:</label>
          <input
            type="text"
            id="EmailInp"
            value={user?.email}
            readOnly
            required
          />
          <label htmlFor="ContactNumInp">Contact Number:</label>
          <input
            type="text"
            id="ContactNumInp"
            value={user?.contact}
            readOnly
            required
          />
          <label htmlFor="ObjectNameInp">Object name:</label>
          <input
            type="text"
            id="ObjectNameInp"
            value={objectName}
            onChange={(e) => setObjectName(e.target.value)}
            required
          />
          <label htmlFor="BrandInp">Brand:</label>
          <input
            type="text"
            id="BrandInp"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            required
          />
          <label htmlFor="ColorInp">Color:</label>
          <select
            id="ColorInp"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            required
          >
            <option value="">Select a color</option>
            <option value="Red">Red</option>
            <option value="Blue">Blue</option>
            <option value="Green">Green</option>
            <option value="Yellow">Yellow</option>
            <option value="Orange">Orange</option>
            <option value="Purple">Purple</option>
            <option value="Pink">Pink</option>
            <option value="Black">Black</option>
            <option value="White">White</option>
            <option value="Gray">Gray</option>
            <option value="Others">Other</option>
          </select>
          {color === "Others" && (
            <input
              type="text"
              placeholder="Specify color"
              value={otherColor}
              onChange={(e) => setColor(e.target.value)}
              required
            />
          )}
          <label htmlFor="DateFoundInp">Date Found:</label>
          <input
            type="date"
            id="DateFoundInp"
            value={dateFound}
            onChange={(e) => setDateFound(e.target.value)}
            required
          />
          <label>Time Found:</label>
          <label htmlFor="TimeFoundInp">Time Found:</label>{" "}
          {/* Added Time Found */}
          <input
            type="time"
            id="TimeFoundInp"
            value={timeFound}
            onChange={(e) => setTimeFound(e.target.value)} // Update timeFound value
            required
          />
          <label htmlFor="LocationFoundInp">Location Found:</label>
          <input
            type="text"
            id="LocationFoundInp"
            value={locationFound}
            onChange={(e) => setLocationFound(e.target.value)}
            required
          />
          <label htmlFor="ImageInp">Upload Image (optional):</label>
          <input
            type="file"
            id="ImageInp"
            onChange={handleImageChange}
            accept="image/*"
          />
          {uploading && <p>Uploading image...</p>}
          <button onClick={prevStep}>Previous</button>
          <button
            onClick={nextStep}
            disabled={
              !objectName ||
              !color ||
              !dateFound ||
              !locationFound ||
              !timeFound
            }
          >
            Next
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="step4">
          <h2>REPORT A FOUND ITEM</h2>
          <p>
            PLEASE PROCEED TO THE DISCIPLINARY OFFICE TO SURRENDER FOUND ITEMS.
          </p>
          <p>Show the Code</p>
          <div>
            {codeExpired ? (
              <div>
                <p>Code expired. Please generate a new code.</p>
                <button onClick={generateCode}>Generate New Code</button>
              </div>
            ) : confirmed ? (
              <div>
                <p>Code confirmed</p>
              </div>
            ) : (
              <div>
                <p>Time left before code expires: {timeLeft} seconds</p>
                <h1>{generatedCode}</h1>
                <p>Admin needs to confirm this code.</p>
              </div>
            )}
          </div>
          <button onClick={prevStep} disabled={confirmed}>
            Previous
          </button>
          <button onClick={nextStep} disabled={!confirmed}>
            Next
          </button>
        </div>
      )}

      {step === 5 && (
        <div className="step5">
          <h2>REPORT A FOUND ITEM</h2>
          <h3>Thank You!</h3>
          <p>Your honesty and effort will greatly assist the owner...</p>
          <button onClick={() => navigate("/homepage#body1")}>
            Return to homepage
          </button>
        </div>
      )}
    </div>
  );
}

export default ReportFoundItem;
