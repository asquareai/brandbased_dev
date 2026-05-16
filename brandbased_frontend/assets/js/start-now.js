const planType = localStorage.getItem("plan_type") || "freemium";

console.log("Start Now Plan Type:", planType);

const freeSection = document.querySelector(".free-section");

const startFreeBtn = document.querySelector(".free-btn");
const premiumBtn  = document.querySelector(".premium-btn");

/* PREMIUM USER */
if (planType === "premium") {

     window.location.href = "brand-creation.html";

}

/* FREEMIUM USER */
else {

    // show both sections normally

    if (startFreeBtn) {

        startFreeBtn.addEventListener("click", () => {

          window.location.href = "brand-creation.html";

        });

    }

    if (premiumBtn) {

        premiumBtn.addEventListener("click", () => {

           window.location.href = "brand-creation.html";

        });

    }

}