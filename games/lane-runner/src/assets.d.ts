// Image imports are resolved by the web app's bundler (Vite) to hashed URLs.
declare module '*.png' {
  const url: string;
  export default url;
}
declare module '*.jpg' {
  const url: string;
  export default url;
}
