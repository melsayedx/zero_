# Install script for directory: /Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "/usr/local")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "Release")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

# Set default install directory permissions.
if(NOT DEFINED CMAKE_OBJDUMP)
  set(CMAKE_OBJDUMP "/Library/Developer/CommandLineTools/usr/bin/objdump")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib" TYPE STATIC_LIBRARY FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-build/clickhouse/libclickhouse-cpp-lib.a")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libclickhouse-cpp-lib.a" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libclickhouse-cpp-lib.a")
    execute_process(COMMAND "/Library/Developer/CommandLineTools/usr/bin/ranlib" "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libclickhouse-cpp-lib.a")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/block.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/client.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/error_codes.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/exceptions.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/server_exception.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/protocol.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/query.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/buffer.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/compressed.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/input.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/open_telemetry.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/output.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/platform.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/projected_iterator.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/singleton.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/socket.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/string_utils.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/string_view.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/uuid.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/wire_format.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/base" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/base/endpoints_iterator.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/array.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/column.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/date.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/decimal.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/enum.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/factory.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/geo.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/ip4.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/ip6.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/itemview.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/lowcardinality.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/nullable.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/numeric.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/map.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/string.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/tuple.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/utils.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/columns" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/columns/uuid.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/types" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/types/type_parser.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Unspecified" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include/clickhouse/types" TYPE FILE FILES "/Users/mody/zero_/cpp-ingester/build/_deps/clickhouse-cpp-src/clickhouse/types/types.h")
endif()

