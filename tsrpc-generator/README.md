# TSRPC-Generator - Generate OpenRPC Definitions from TypeScript interfaces/classes


### Behaviour

- Each callable member of the interface/class is converted into one method on the service
- Methods which contain unconvertable types are skipped with a warning
    - e.g. All methods which take functions or return functions
- Anonymous/Inline Types are inlined in the OpenRPC Schema
- Named Types are deduplicated and extracted to the ContentDescriptors top level key and referenced with $ref



### Limitations

- No method overloading
- No generics outside of some specially handled types
    - Promise<T> in return type annotations


### Not-so-frequently-asked questions

#### Isn't this kind of backwards? Shouldn't you go from RPC spec to TS, not the other way around?

Probably. This tool is not meant to be your single source of truth, but rather a supplement for your existing RPC infrastructure. If you already have some core typescript interfaces written and you want RPC definitions, this is for you.

#### Why would you want that?

The main use case of this tool came about to auto-generate UI and debugging tools for our RPC interfaces. By using both protobuf to OpenRPC and TS to OpenRPC converters, we can use Json Schemas as our unifying representation for APIs. 
