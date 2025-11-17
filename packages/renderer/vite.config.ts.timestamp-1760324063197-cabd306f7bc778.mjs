// vite.config.ts
import { defineConfig } from "file:///Users/hartmut/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Coding/Project%20Phoenix/asaps-modern/node_modules/vite/dist/node/index.js";
import react from "file:///Users/hartmut/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Coding/Project%20Phoenix/asaps-modern/node_modules/@vitejs/plugin-react/dist/index.js";
import dts from "file:///Users/hartmut/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Coding/Project%20Phoenix/asaps-modern/node_modules/vite-plugin-dts/dist/index.mjs";
import { resolve } from "path";
var __vite_injected_original_dirname = "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/renderer";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      rollupTypes: false,
      // Changed to false - don't bundle types
      copyDtsFiles: true
      // Copy individual .d.ts files instead
    })
  ],
  build: {
    lib: {
      entry: resolve(__vite_injected_original_dirname, "src/index.ts"),
      name: "ASAPSRenderer",
      formats: ["es", "cjs"],
      fileName: (format) => `asaps-renderer.${format}.js`
    },
    rollupOptions: {
      external: ["react", "react-dom", "react-dom/client", "@asaps/core"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react-dom/client": "ReactDOMClient",
          "@asaps/core": "ASAPSCore"
        }
      }
    },
    sourcemap: true,
    minify: false
  },
  resolve: {
    alias: {
      "@": resolve(__vite_injected_original_dirname, "./src")
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvaGFydG11dC9MaWJyYXJ5L01vYmlsZSBEb2N1bWVudHMvY29tfmFwcGxlfkNsb3VkRG9jcy9Db2RpbmcvUHJvamVjdCBQaG9lbml4L2FzYXBzLW1vZGVybi9wYWNrYWdlcy9yZW5kZXJlclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2hhcnRtdXQvTGlicmFyeS9Nb2JpbGUgRG9jdW1lbnRzL2NvbX5hcHBsZX5DbG91ZERvY3MvQ29kaW5nL1Byb2plY3QgUGhvZW5peC9hc2Fwcy1tb2Rlcm4vcGFja2FnZXMvcmVuZGVyZXIvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2hhcnRtdXQvTGlicmFyeS9Nb2JpbGUlMjBEb2N1bWVudHMvY29tJTdFYXBwbGUlN0VDbG91ZERvY3MvQ29kaW5nL1Byb2plY3QlMjBQaG9lbml4L2FzYXBzLW1vZGVybi9wYWNrYWdlcy9yZW5kZXJlci92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcbmltcG9ydCBkdHMgZnJvbSAndml0ZS1wbHVnaW4tZHRzJztcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksIFxuICAgIGR0cyh7XG4gICAgICBpbnNlcnRUeXBlc0VudHJ5OiB0cnVlLFxuICAgICAgcm9sbHVwVHlwZXM6IGZhbHNlLCAgLy8gQ2hhbmdlZCB0byBmYWxzZSAtIGRvbid0IGJ1bmRsZSB0eXBlc1xuICAgICAgY29weUR0c0ZpbGVzOiB0cnVlICAgLy8gQ29weSBpbmRpdmlkdWFsIC5kLnRzIGZpbGVzIGluc3RlYWRcbiAgICB9KVxuICBdLFxuICBidWlsZDoge1xuICAgIGxpYjoge1xuICAgICAgZW50cnk6IHJlc29sdmUoX19kaXJuYW1lLCAnc3JjL2luZGV4LnRzJyksXG4gICAgICBuYW1lOiAnQVNBUFNSZW5kZXJlcicsXG4gICAgICBmb3JtYXRzOiBbJ2VzJywgJ2NqcyddLFxuICAgICAgZmlsZU5hbWU6IChmb3JtYXQpID0+IGBhc2Fwcy1yZW5kZXJlci4ke2Zvcm1hdH0uanNgXG4gICAgfSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBleHRlcm5hbDogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3QtZG9tL2NsaWVudCcsICdAYXNhcHMvY29yZSddLFxuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGdsb2JhbHM6IHtcbiAgICAgICAgICByZWFjdDogJ1JlYWN0JyxcbiAgICAgICAgICAncmVhY3QtZG9tJzogJ1JlYWN0RE9NJyxcbiAgICAgICAgICAncmVhY3QtZG9tL2NsaWVudCc6ICdSZWFjdERPTUNsaWVudCcsXG4gICAgICAgICAgJ0Bhc2Fwcy9jb3JlJzogJ0FTQVBTQ29yZSdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgc291cmNlbWFwOiB0cnVlLFxuICAgIG1pbmlmeTogZmFsc2VcbiAgfSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKVxuICAgIH1cbiAgfVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTZnQixTQUFTLG9CQUFvQjtBQUMxaUIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sU0FBUztBQUNoQixTQUFTLGVBQWU7QUFIeEIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sSUFBSTtBQUFBLE1BQ0Ysa0JBQWtCO0FBQUEsTUFDbEIsYUFBYTtBQUFBO0FBQUEsTUFDYixjQUFjO0FBQUE7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsS0FBSztBQUFBLE1BQ0gsT0FBTyxRQUFRLGtDQUFXLGNBQWM7QUFBQSxNQUN4QyxNQUFNO0FBQUEsTUFDTixTQUFTLENBQUMsTUFBTSxLQUFLO0FBQUEsTUFDckIsVUFBVSxDQUFDLFdBQVcsa0JBQWtCLE1BQU07QUFBQSxJQUNoRDtBQUFBLElBQ0EsZUFBZTtBQUFBLE1BQ2IsVUFBVSxDQUFDLFNBQVMsYUFBYSxvQkFBb0IsYUFBYTtBQUFBLE1BQ2xFLFFBQVE7QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE9BQU87QUFBQSxVQUNQLGFBQWE7QUFBQSxVQUNiLG9CQUFvQjtBQUFBLFVBQ3BCLGVBQWU7QUFBQSxRQUNqQjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsRUFDVjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUNqQztBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
