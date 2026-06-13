const t=document.getElementById("theme-toggle");t?.addEventListener("click",()=>{const e=document.documentElement.classList.toggle("dark");localStorage.setItem("theme",e?"dark":"light")});
