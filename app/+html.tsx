import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, interactive-widget=resizes-visual"
        />
        <title>Event Horizon</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: [
          `html { position: fixed; width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; }`,
          `body { width: 100%; height: 100%; overflow: hidden; margin: 0; }`,
          `html.page-hidden *, html.page-hidden *::before, html.page-hidden *::after { animation-play-state: paused !important; transition: none !important; }`,
        ].join("\n") }} />
        <script dangerouslySetInnerHTML={{ __html: `document.addEventListener("visibilitychange",function(){document.documentElement.classList.toggle("page-hidden",document.hidden)})` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            function show(msg){
              var el=document.getElementById("eh-demo-err");
              if(!el){el=document.createElement("div");el.id="eh-demo-err";el.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99999;background:#300;color:#f88;font:11px monospace;padding:6px 10px;white-space:pre-wrap;max-height:40vh;overflow:auto";document.body.appendChild(el);}
              el.textContent+=msg+"\n";
            }
            window.addEventListener("error",function(e){show("[error] "+(e.message||"")+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno)});
            window.addEventListener("unhandledrejection",function(e){show("[promise] "+String(e.reason&&e.reason.message||e.reason).slice(0,300))});
          })();
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
