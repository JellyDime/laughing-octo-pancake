/// yabai_infinite_scroll.js
!function(){"use strict";if(window.__YABAI_INFINITE_SCROLL_INIT__)return;window.__YABAI_INFINITE_SCROLL_INIT__=!0;let e=new Map,t=new Set,l=0,a="",n=1,i=/(?:https?:\/\/[^\s"'<>\\]+?)?\/(\d{4})-[0-9a-fA-F]+-[a-zA-Z0-9]+\.(?:png|jpg|jpeg|webp)/i,r=/(https?:\/\/[^\s"'<>\\]+?\/(\d{4})-[0-9a-fA-F]+-[a-zA-Z0-9]+\.(?:png|jpg|jpeg|webp))/gi;function o(e,t){let l=document.getElementById(`gallery-page-${e}`);if(!l)return;let a=l.querySelector(".infinite-scroll-page-img"),n=l.querySelector(".page-loading-placeholder");n&&n.remove(),a&&a.getAttribute("src")!==t&&(a.src=t,a.style.opacity="1",l.style.minHeight="auto")}async function s(l){if(!(e.has(l)||t.has(l))){t.add(l);try{let a=new URL(window.location.href);a.pathname.endsWith("/read")||(a.pathname=a.pathname.replace(/\/$/,"")+"/read"),a.searchParams.set("page",l);let n=await fetch(a.toString(),{headers:{Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}});if(!n.ok)throw Error(`HTTP ${n.status}`);let i=await n.text(),s;for(r.lastIndex=0;null!==(s=r.exec(i));){let p=s[1];if(p.includes("/tbn/"))continue;let c=parseInt(s[2],10);c>=1&&!e.has(c)&&(e.set(c,p),o(c,p))}}catch(d){console.error(`[Yabai Infinite Scroll] Error fetching page ${l}:`,d)}finally{t.delete(l)}}}function p(){!function e(){let t=document.getElementById("page-select");t&&t.options&&t.options.length>0&&(l=Math.max(l,t.options.length));let n=document.getElementById("app");if(n){let i=n.getAttribute("data-page");if(i)try{let r=JSON.parse(i),o=r?.props?.post?.data;o&&(o.page_count&&(l=Math.max(l,Number(o.page_count))),o.slug&&(a=o.slug))}catch(s){console.warn("[Yabai Infinite Scroll] Could not parse data-page attribute:",s)}}0===l&&(l=1)}(),document.querySelectorAll("img").forEach(t=>{let l=t.src||t.getAttribute("src");if(!l||l.includes("/tbn/"))return;let a=i.exec(l);if(a){let n=parseInt(a[1],10);n>=1&&!e.has(n)&&(e.set(n,l),o(n,l))}});let t=function t(){let a=document.querySelector(".cursor-pointer.mx-auto")||document.querySelector(".text-center img");if(!a)return!1;let i=a.closest(".text-center")||a.parentElement;if(!i)return!1;if(document.getElementById("infinite-scroll-gallery-container"))return!0;console.log(`[Yabai Infinite Scroll] Initializing gallery with ${l} pages...`);let r=document.createElement("div");r.id="infinite-scroll-gallery-container",r.style.cssText=`
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
            width: 100%;
            max-width: 1100px;
            margin: 0 auto;
            padding: 16px 0 64px 0;
        `;for(let o=1;o<=l;o++){let p=document.createElement("div");p.className="infinite-scroll-page-item",p.id=`gallery-page-${o}`,p.setAttribute("data-page",o),p.style.cssText=`
                position: relative;
                width: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                background: rgba(15, 23, 42, 0.4);
                border-radius: 8px;
                overflow: hidden;
                min-height: 400px;
                justify-content: center;
            `;let c=document.createElement("div");c.className="infinite-scroll-page-badge",c.textContent=`Page ${o} / ${l}`,c.style.cssText=`
                position: absolute;
                top: 12px;
                left: 12px;
                background: rgba(15, 23, 42, 0.85);
                color: #34d399;
                font-size: 13px;
                font-weight: 700;
                padding: 4px 10px;
                border-radius: 6px;
                pointer-events: none;
                z-index: 20;
                backdrop-filter: blur(6px);
                border: 1px solid rgba(52, 211, 153, 0.3);
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            `,p.appendChild(c);let d=document.createElement("img");if(d.className="infinite-scroll-page-img",d.alt=`Page ${o}`,d.style.cssText=`
                max-width: 100%;
                height: auto;
                display: block;
                margin: 0 auto;
                border-radius: 4px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                transition: opacity 0.3s ease;
            `,e.has(o))d.src=e.get(o),d.style.opacity="1",p.style.minHeight="auto";else{d.style.opacity="0";let g=document.createElement("div");g.className="page-loading-placeholder",g.style.cssText=`
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 80px 20px;
                    color: #94a3b8;
                    font-size: 15px;
                    gap: 12px;
                `,g.innerHTML=`
                    <div style="width:28px;height:28px;border:3px solid #334155;border-top-color:#10b981;border-radius:50%;animation:nprogress-spinner 600ms linear infinite;"></div>
                    <span>Loading Page ${o}...</span>
                `,p.appendChild(g)}d.addEventListener("click",e=>{e.stopPropagation(),e.preventDefault()}),p.appendChild(d),r.appendChild(p)}i.innerHTML="",i.appendChild(r);let $=document.querySelector(".hidden");return $&&($.style.display="none"),function t(){let a=new IntersectionObserver(t=>{t.forEach(t=>{if(t.isIntersecting){let a=parseInt(t.target.getAttribute("data-page"),10);e.has(a)||s(a);for(let n=a+1;n<=Math.min(l,a+3);n++)e.has(n)||s(n)}})},{rootMargin:"2500px 0px",threshold:0}),i=new IntersectionObserver(e=>{e.forEach(e=>{if(e.isIntersecting){let t=parseInt(e.target.getAttribute("data-page"),10);n=t;let l=document.getElementById("page-select");l&&l.value!==String(t)&&(l.value=String(t))}})},{rootMargin:"-20% 0px -60% 0px",threshold:0});document.querySelectorAll(".infinite-scroll-page-item").forEach(e=>{a.observe(e),i.observe(e)});for(let r=1;r<=Math.min(6,l);r++)e.has(r)||s(r)}(),function t(){let l=document.getElementById("page-select");if(l){let a=l.cloneNode(!0);l.parentNode.replaceChild(a,l),a.addEventListener("change",t=>{let l=parseInt(t.target.value,10),a=document.getElementById(`gallery-page-${l}`);a&&(a.scrollIntoView({behavior:"smooth",block:"start"}),e.has(l)||s(l))})}let n=document.querySelector(".reader-nav .flex");if(n&&!document.getElementById("yabai-infinite-toggle-btn")){let i=document.createElement("button");i.id="yabai-infinite-toggle-btn",i.title="Infinite Scroll Enabled (Click to Scroll to Top)",i.className="outline-none text-emerald-400 bg-slate-700/80 hover:bg-emerald-600 hover:text-white px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ml-2 border border-emerald-500/30",i.innerHTML=`<span>∞</span><span>Infinite</span>`,i.addEventListener("click",()=>{window.scrollTo({top:0,behavior:"smooth"})}),n.appendChild(i)}}(),window.addEventListener("keydown",e=>{if(!["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)){if("j"!==e.key&&("n"!==e.key||e.ctrlKey||e.metaKey)){if("k"===e.key||"p"===e.key&&!e.ctrlKey&&!e.metaKey){let t=Math.max(1,n-1),a=document.getElementById(`gallery-page-${t}`);a&&a.scrollIntoView({behavior:"smooth",block:"start"})}}else{let i=Math.min(l,n+1),r=document.getElementById(`gallery-page-${i}`);r&&r.scrollIntoView({behavior:"smooth",block:"start"})}}}),!0}();t||setTimeout(p,200)}"loading"===document.readyState?document.addEventListener("DOMContentLoaded",p):p();let c=document.documentElement||document.body,d=new MutationObserver(()=>{document.getElementById("page-select")&&!document.getElementById("infinite-scroll-gallery-container")&&p()});d.observe(c,{childList:!0,subtree:!0})}();
