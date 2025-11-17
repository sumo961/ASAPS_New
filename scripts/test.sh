#!/bin/bash

# Comprehensive test runner for ASPAS Modern
# This script runs all tests across packages with proper configuration

set -e

echo "🧪 ASPAS Modern Test Suite"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2

    case $status in
        "success")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "error")
            echo -e "${RED}❌ $message${NC}"
            ;;
        "info")
            echo -e "${YELLOW}ℹ️  $message${NC}"
            ;;
        *)
            echo "$message"
            ;;
    esac
}

# Function to run tests for a specific package
run_package_tests() {
    local package_name=$1
    local package_dir=$2
    local test_type=$3

    print_status "info" "Running $test_type tests for $package_name..."

    cd "$package_dir"

    case $test_type in
        "unit")
            if npm run test -- --run; then
                print_status "success" "$package_name unit tests passed"
                return 0
            else
                print_status "error" "$package_name unit tests failed"
                return 1
            fi
            ;;
        "coverage")
            if npm run test:coverage -- --run; then
                print_status "success" "$package_name coverage tests passed"
                return 0
            else
                print_status "error" "$package_name coverage tests failed"
                return 1
            fi
            ;;
        "ui")
            if npm run test:ui -- --run; then
                print_status "success" "$package_name UI tests passed"
                return 0
            else
                print_status "error" "$package_name UI tests failed"
                return 1
            fi
            ;;
        *)
            print_status "error" "Unknown test type: $test_type"
            return 1
            ;;
    esac
}

# Function to run type checking
run_type_check() {
    print_status "info" "Running TypeScript type checking..."

    if npm run type-check; then
        print_status "success" "TypeScript type checking passed"
        return 0
    else
        print_status "error" "TypeScript type checking failed"
        return 1
    fi
}

# Function to run linting
run_lint() {
    print_status "info" "Running ESLint..."

    if npm run lint; then
        print_status "success" "ESLint passed"
        return 0
    else
        print_status "error" "ESLint failed"
        return 1
    fi
}

# Main test execution
main() {
    local test_mode=${1:-"all"}
    local exit_code=0

    print_status "info" "Starting test suite in $test_mode mode"

    # Get project root
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    cd "$PROJECT_ROOT"

    # Ensure dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_status "info" "Installing dependencies..."
        npm install
    fi

    case $test_mode in
        "type-check")
            run_type_check || exit_code=1
            ;;
        "lint")
            run_lint || exit_code=1
            ;;
        "unit")
            # Run unit tests for all packages
            run_package_tests "Core" "packages/core" "unit" || exit_code=1
            run_package_tests "Renderer" "packages/renderer" "unit" || exit_code=1
            run_package_tests "Builder" "packages/builder" "unit" || exit_code=1
            ;;
        "coverage")
            # Run coverage tests for all packages
            run_package_tests "Core" "packages/core" "coverage" || exit_code=1
            run_package_tests "Renderer" "packages/renderer" "coverage" || exit_code=1
            run_package_tests "Builder" "packages/builder" "coverage" || exit_code=1
            ;;
        "ui")
            # Run UI tests (mainly for builder package)
            run_package_tests "Builder" "packages/builder" "ui" || exit_code=1
            ;;
        "core")
            # Run tests for core package only
            run_package_tests "Core" "packages/core" "unit" || exit_code=1
            ;;
        "builder")
            # Run tests for builder package only
            run_package_tests "Builder" "packages/builder" "unit" || exit_code=1
            ;;
        "renderer")
            # Run tests for renderer package only
            run_package_tests "Renderer" "packages/renderer" "unit" || exit_code=1
            ;;
        "all")
            # Run all tests
            print_status "info" "Running complete test suite..."

            # Type checking
            run_type_check || exit_code=1

            # Linting
            run_lint || exit_code=1

            # Unit tests
            run_package_tests "Core" "packages/core" "unit" || exit_code=1
            run_package_tests "Renderer" "packages/renderer" "unit" || exit_code=1
            run_package_tests "Builder" "packages/builder" "unit" || exit_code=1

            # Coverage tests
            run_package_tests "Core" "packages/core" "coverage" || exit_code=1
            run_package_tests "Renderer" "packages/renderer" "coverage" || exit_code=1
            run_package_tests "Builder" "packages/builder" "coverage" || exit_code=1
            ;;
        *)
            echo "Usage: $0 [type-check|lint|unit|coverage|ui|core|builder|renderer|all]"
            echo ""
            echo "Test modes:"
            echo "  type-check  - Run TypeScript type checking only"
            echo "  lint        - Run ESLint only"
            echo "  unit        - Run unit tests for all packages"
            echo "  coverage    - Run coverage tests for all packages"
            echo "  ui          - Run UI tests (builder package)"
            echo "  core        - Run core package tests only"
            echo "  builder     - Run builder package tests only"
            echo "  renderer    - Run renderer package tests only"
            echo "  all         - Run complete test suite (default)"
            exit 1
            ;;
    esac

    if [ $exit_code -eq 0 ]; then
        print_status "success" "All tests passed! 🎉"
    else
        print_status "error" "Some tests failed. Check the output above for details."
    fi

    exit $exit_code
}

# Run main function with all arguments
main "$@"