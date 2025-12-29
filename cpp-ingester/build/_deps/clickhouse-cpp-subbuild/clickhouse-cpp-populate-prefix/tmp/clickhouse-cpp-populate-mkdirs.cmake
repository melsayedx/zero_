# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file Copyright.txt or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION 3.5)

file(MAKE_DIRECTORY
  "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src"
  "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-build"
  "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-subbuild/clickhouse-cpp-populate-prefix"
  "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-subbuild/clickhouse-cpp-populate-prefix/tmp"
  "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-subbuild/clickhouse-cpp-populate-prefix/src/clickhouse-cpp-populate-stamp"
  "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-subbuild/clickhouse-cpp-populate-prefix/src"
  "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-subbuild/clickhouse-cpp-populate-prefix/src/clickhouse-cpp-populate-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-subbuild/clickhouse-cpp-populate-prefix/src/clickhouse-cpp-populate-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-subbuild/clickhouse-cpp-populate-prefix/src/clickhouse-cpp-populate-stamp${cfgdir}") # cfgdir has leading slash
endif()
