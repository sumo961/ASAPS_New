// vite.config.ts
import { defineConfig } from "file:///Users/hartmut/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Coding/Project%20Phoenix/asaps-modern/node_modules/vite/dist/node/index.js";
import { resolve } from "path";
import dts from "file:///Users/hartmut/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/Coding/Project%20Phoenix/asaps-modern/node_modules/vite-plugin-dts/dist/index.mjs";
var __vite_injected_original_dirname = "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core";
var vite_config_default = defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      // generates dist/index.d.ts
      rollupTypes: true
      // bundles all .d.ts into one file
    })
  ],
  build: {
    lib: {
      entry: resolve(__vite_injected_original_dirname, "src/index.ts"),
      name: "ASAPSCore",
      formats: ["es", "cjs"],
      fileName: (format) => format === "es" ? "index.js" : "index.cjs"
    },
    rollupOptions: {
      external: ["eventemitter3", "idb"],
      output: {
        globals: {
          eventemitter3: "EventEmitter3",
          idb: "idb"
        }
      }
    },
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvaGFydG11dC9MaWJyYXJ5L01vYmlsZSBEb2N1bWVudHMvY29tfmFwcGxlfkNsb3VkRG9jcy9Db2RpbmcvUHJvamVjdCBQaG9lbml4L2FzYXBzLW1vZGVybi9wYWNrYWdlcy9jb3JlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvaGFydG11dC9MaWJyYXJ5L01vYmlsZSBEb2N1bWVudHMvY29tfmFwcGxlfkNsb3VkRG9jcy9Db2RpbmcvUHJvamVjdCBQaG9lbml4L2FzYXBzLW1vZGVybi9wYWNrYWdlcy9jb3JlL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9oYXJ0bXV0L0xpYnJhcnkvTW9iaWxlJTIwRG9jdW1lbnRzL2NvbSU3RWFwcGxlJTdFQ2xvdWREb2NzL0NvZGluZy9Qcm9qZWN0JTIwUGhvZW5peC9hc2Fwcy1tb2Rlcm4vcGFja2FnZXMvY29yZS92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IGR0cyBmcm9tICd2aXRlLXBsdWdpbi1kdHMnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgZHRzKHtcbiAgICAgIGluc2VydFR5cGVzRW50cnk6IHRydWUsICAgLy8gZ2VuZXJhdGVzIGRpc3QvaW5kZXguZC50c1xuICAgICAgcm9sbHVwVHlwZXM6IHRydWUgICAgICAgICAvLyBidW5kbGVzIGFsbCAuZC50cyBpbnRvIG9uZSBmaWxlXG4gICAgfSlcbiAgXSxcbiAgYnVpbGQ6IHtcbiAgICBsaWI6IHtcbiAgICAgIGVudHJ5OiByZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9pbmRleC50cycpLFxuICAgICAgbmFtZTogJ0FTQVBTQ29yZScsXG4gICAgICBmb3JtYXRzOiBbJ2VzJywgJ2NqcyddLFxuICAgICAgZmlsZU5hbWU6IChmb3JtYXQpID0+IGZvcm1hdCA9PT0gJ2VzJyA/ICdpbmRleC5qcycgOiAnaW5kZXguY2pzJ1xuICAgIH0sXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgZXh0ZXJuYWw6IFsnZXZlbnRlbWl0dGVyMycsICdpZGInXSxcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBnbG9iYWxzOiB7XG4gICAgICAgICAgZXZlbnRlbWl0dGVyMzogJ0V2ZW50RW1pdHRlcjMnLFxuICAgICAgICAgIGlkYjogJ2lkYidcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgc291cmNlbWFwOiB0cnVlLFxuICAgIG91dERpcjogJ2Rpc3QnLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlXG4gIH0sXG4gIHRlc3Q6IHtcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcbiAgICBnbG9iYWxzOiB0cnVlXG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpZ0IsU0FBUyxvQkFBb0I7QUFDOWhCLFNBQVMsZUFBZTtBQUN4QixPQUFPLFNBQVM7QUFGaEIsSUFBTSxtQ0FBbUM7QUFJekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsSUFBSTtBQUFBLE1BQ0Ysa0JBQWtCO0FBQUE7QUFBQSxNQUNsQixhQUFhO0FBQUE7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxLQUFLO0FBQUEsTUFDSCxPQUFPLFFBQVEsa0NBQVcsY0FBYztBQUFBLE1BQ3hDLE1BQU07QUFBQSxNQUNOLFNBQVMsQ0FBQyxNQUFNLEtBQUs7QUFBQSxNQUNyQixVQUFVLENBQUMsV0FBVyxXQUFXLE9BQU8sYUFBYTtBQUFBLElBQ3ZEO0FBQUEsSUFDQSxlQUFlO0FBQUEsTUFDYixVQUFVLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxNQUNqQyxRQUFRO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxlQUFlO0FBQUEsVUFDZixLQUFLO0FBQUEsUUFDUDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsRUFDZjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osYUFBYTtBQUFBLElBQ2IsU0FBUztBQUFBLEVBQ1g7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
